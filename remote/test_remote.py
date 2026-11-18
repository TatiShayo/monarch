import base64
import hashlib
import json
import socket
import struct
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import remote_server as rs


class MockTVWSServer(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.srv.bind(("127.0.0.1", 0))
        self.srv.listen(4)
        self.port = self.srv.getsockname()[1]
        self.received = []
        self.stop_flag = False

    def run(self):
        while not self.stop_flag:
            try:
                self.srv.settimeout(0.2)
                conn, _ = self.srv.accept()
            except OSError:
                continue
            self._serve_conn(conn)

    def _send_text(self, conn, text: str):
        b = text.encode("utf-8")
        hdr = struct.pack("!BB", 0x81, len(b)) if len(b) < 126 else struct.pack("!BBH", 0x81, 126, len(b))
        conn.sendall(hdr + b)

    def _read_client_frame(self, conn) -> str | None:
        h = conn.recv(2)
        if len(h) < 2:
            return None
        op = h[0] & 0x0F
        if op == 0x8:
            return None
        n = h[1] & 0x7F
        if n == 126:
            n = struct.unpack("!H", conn.recv(2))[0]
        mask = conn.recv(4) if (h[1] & 0x80) else b"\x00\x00\x00\x00"
        data = bytearray()
        while len(data) < n:
            c = conn.recv(n - len(data))
            if not c:
                break
            data += c
        return bytes(b ^ mask[i % 4] for i, b in enumerate(data)).decode("utf-8")

    def _serve_conn(self, conn):
        try:
            req = conn.recv(4096).decode("latin-1")
            key = ""
            for ln in req.split("\r\n"):
                if ln.lower().startswith("sec-websocket-key:"):
                    key = ln.split(":", 1)[1].strip()
            acc = base64.b64encode(hashlib.sha1((key + "258EAFA5-E94D-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
            conn.sendall(
                f"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {acc}\r\n\r\n".encode("ascii")
            )
            self._send_text(conn, json.dumps({"event": "ms.channel.connect", "data": {"token": "99887766"}}))
            conn.settimeout(2.0)
            while not self.stop_flag:
                try:
                    msg = self._read_client_frame(conn)
                    if msg is None:
                        break
                    self.received.append(json.loads(msg))
                except OSError:
                    break
        finally:
            conn.close()


class TestMonarchRemote(unittest.TestCase):
    def test_remote_flow(self):
        mock_tv = MockTVWSServer()
        mock_tv.start()
        tok_path = Path(__file__).parent / "test_token.json"
        if tok_path.exists():
            tok_path.unlink()

        link = rs.TVLink("127.0.0.1", token_file=tok_path, ws_port=mock_tv.port, use_tls=False)
        http = rs.ThreadingHTTPServer(("127.0.0.1", 0), rs.make_handler(link, "http://127.0.0.1:8765"))
        port = http.server_address[1]
        t = threading.Thread(target=http.serve_forever, daemon=True)
        t.start()

        try:
            # 1. HTML UI
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/") as r:
                html = r.read().decode("utf-8")
                self.assertEqual(r.status, 200)
                self.assertIn("Monarch Remote", html)
                self.assertIn("KEY_ENTER", html)
                self.assertIn("KEY_9", html)
                self.assertIn('data-rep="1"', html)

            # 2. Bad key rejected (400)
            req_bad = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/key",
                data=json.dumps({"key": "KEY_FACTORY_RESET"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(req_bad)
            self.assertEqual(ctx.exception.code, 400)

            # 3. Valid key connects, saves token, forwards Samsung WS packet
            req_ok = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/key",
                data=json.dumps({"key": "KEY_ENTER"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req_ok) as r:
                res = json.loads(r.read().decode())
                self.assertTrue(res["sent"])
                self.assertTrue(res["paired"])

            # 4. Text input forwarding
            req_txt = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/text",
                data=json.dumps({"text": "Twin Peaks"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req_txt) as r:
                self.assertTrue(json.loads(r.read().decode())["sent"])

            # Verify mock TV received exact Samsung packets & token saved
            for _ in range(20):
                if len(mock_tv.received) >= 2:
                    break
                import time
                time.sleep(0.05)
            self.assertGreaterEqual(len(mock_tv.received), 2)
            self.assertEqual(mock_tv.received[0]["method"], "ms.remote.control")
            self.assertEqual(mock_tv.received[0]["params"]["DataOfCmd"], "KEY_ENTER")
            self.assertEqual(mock_tv.received[1]["params"]["TypeOfRemote"], "SendInputString")
            self.assertEqual(base64.b64decode(mock_tv.received[1]["params"]["Cmd"]).decode(), "Twin Peaks")
            saved = json.loads(tok_path.read_text())
            self.assertEqual(saved["127.0.0.1"]["token"], "99887766")

            # 5. PIN mode rejects unauthenticated POSTs with 401 and accepts X-Pin
            pin_http = rs.ThreadingHTTPServer(("127.0.0.1", 0), rs.make_handler(link, "http://127.0.0.1:8765", pin="1234"))
            pin_port = pin_http.server_address[1]
            pt = threading.Thread(target=pin_http.serve_forever, daemon=True)
            pt.start()
            try:
                req_no_pin = urllib.request.Request(
                    f"http://127.0.0.1:{pin_port}/api/key",
                    data=json.dumps({"key": "KEY_ENTER"}).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(urllib.error.HTTPError) as pctx:
                    urllib.request.urlopen(req_no_pin)
                self.assertEqual(pctx.exception.code, 401)
                req_pin_ok = urllib.request.Request(
                    f"http://127.0.0.1:{pin_port}/api/key",
                    data=json.dumps({"key": "KEY_ENTER"}).encode(),
                    headers={"Content-Type": "application/json", "X-Pin": "1234"},
                    method="POST",
                )
                with urllib.request.urlopen(req_pin_ok) as r:
                    self.assertTrue(json.loads(r.read().decode())["sent"])
            finally:
                pin_http.shutdown()
                pin_http.server_close()

            print("ALL MONARCH REMOTE UNIT/INTEGRATION TESTS PASSED")
        finally:
            http.shutdown()
            http.server_close()
            mock_tv.stop_flag = True
            mock_tv.srv.close()
            if tok_path.exists():
                tok_path.unlink()


if __name__ == "__main__":
    unittest.main()
