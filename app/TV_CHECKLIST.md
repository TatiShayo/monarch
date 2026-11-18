# Safe TV Connection, Read-Only Diagnostics & Sideload Checklist (`UE65NU7100` / Tizen 4.0)

> **Scope note:** Every command below was verified against `apps2samsung-cli.exe --help` (`3.3.0`) and official Samsung/Tizen documentation. Commands that retail TVs block (`sdb shell`, raw `df`/`dmesg`) are explicitly flagged and excluded from automation.

---

## 1. Pre-Connection Safety Checklist
1. **LAN / Host Firewall Readiness:**
   - Ensure PC and TV are on the same LAN (`192.168.1.66` PC <-> `192.168.1.64` `[TV] Tati`, Wi-Fi MAC `64:1C:AE:FB:1B:33`).
   - Optionally start local `dns_shield.py` and confirm only Samsung telemetry/OTA/ad domains are blocked before bringing Developer Mode online.
2. **Offline App Guarantee (`usb-shelf`):**
   - `config.xml` contains **zero** internet/network privileges (`filesystem.read`, `tv.inputdevice`, `avplay` only).
   - Keep TV **Developer Mode Host PC IP** pointed strictly to `192.168.1.66`.
3. **Never touch TV root/system partitions:**
   - Do not attempt third-party root scripts or modify `/etc` / `/usr`. Only sign & install user `.wgt` packages through Samsung's sanctioned debug port (`26101`).

---

## 2. Enable Developer Mode on the TV
1. Turn on `[TV] Tati` (`192.168.1.64`).
2. Press **Home** -> **Apps**.
3. On the remote, press `1` `2` `3` `4` `5` sequentially to open the **Developer Mode** dialog.
4. Set **Developer Mode** -> **ON**.
5. Enter **Host PC IP** -> `192.168.1.66`.
6. Click **OK**, then perform a **cold reboot** of the TV (hold the remote Power button ~5s until TV restarts, or unplug power for 10s and plug back in).

---

## 3. Read-Only Diagnostics First (Before Installing Anything)
Run these read-only commands from `C:\tvdiag\tizen_apps\cli\apps2samsung-cli.exe`:

```powershell
# 1. Discover TVs on the subnet and confirm Developer Mode / debug port reachability
apps2samsung-cli.exe scan

# 2. Query TV Dev Mode status, debug port (26101), Tizen version, and hardware DUID
apps2samsung-cli.exe tv 192.168.1.64

# 3. List already-installed apps on the TV
apps2samsung-cli.exe installed --tv 192.168.1.64

# 4. Inspect any leftover package files in the TV's staging directory (read-only list)
apps2samsung-cli.exe leftovers --tv 192.168.1.64
```

*(Optional, only if Tizen Studio `sdb` is also installed — note retail firmware blocks raw shell commands like `cat`, `df`, `dmesg` with `closed`)*:
```powershell
sdb connect 192.168.1.64:26101
sdb devices
sdb shell 0 getduid
sdb shell 0 applist
```

---

## 4. Certificate Signing & Sideload Order (`usb-shelf.wgt` + Selected Apps)
1. **Prepare/Verify Author + Distributor Certificate tied to TV DUID:**
   ```powershell
   apps2samsung-cli.exe cert --tv 192.168.1.64 --prepare
   ```
2. **Sideload `usb-shelf.wgt` (signs automatically for TV DUID & installs):**
   ```powershell
   apps2samsung-cli.exe install "C:\tvdiag\tizen_apps\usb-shelf.wgt" --tv 192.168.1.64
   ```
   *(Or sign without installing first: `apps2samsung-cli.exe sign usb-shelf.wgt -o usb-shelf-signed.wgt --tv 192.168.1.64`)*
3. **Launch & Debug Check:**
   ```powershell
   apps2samsung-cli.exe launch UsbShelf01.UsbShelf --tv 192.168.1.64
   ```
   - Open `Diagnostics` tile or press **Info** in `USB Shelf` to verify `tizen API: yes`, `avplay: yes`, `USB storages: removable_sda1 [MOUNTED]`.
   - Test folder browse, poster/NFO load (if present), subtitle toggle (`Red`), audio track switch (`Green`), sync (`Yellow`/`Blue`), Pause/Seek (`Left`/`Right`), and `Return` back to Home.

---

## 5. Error Codes & Troubleshooting
- **Error `[118012]` (package install fails around ~23%):** Signature / DUID mismatch or missing TV permission. Re-verify `apps2samsung-cli.exe tv 192.168.1.64` DUID, run `apps2samsung-cli.exe cert --tv 192.168.1.64 --prepare`, re-check Host PC IP `192.168.1.66`, cold-reboot TV, or right-click TV in Tizen Device Manager -> *Permit to install applications*.
- **Connection refused / debug port unreachable:** Confirm TV cold reboot after setting `192.168.1.66`, confirm PC IP has not changed on DHCP, and check Windows Firewall isn't blocking outbound/inbound port `26101`.
- **Stuck staging package eating TV flash:** Clear stale staging leftovers cleanly:
  ```powershell
  apps2samsung-cli.exe leftovers --tv 192.168.1.64 --clear
  ```

---

## 6. Clean Rollback
1. Uninstall cleanly by app ID printed by `installed`:
   ```powershell
   apps2samsung-cli.exe uninstall UsbShelf01.UsbShelf --tv 192.168.1.64
   ```
2. Optionally toggle **Apps -> `12345` -> Developer Mode -> OFF** and cold-reboot the TV to close debug port `26101`.
