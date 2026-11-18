@echo off
title Monarch TV Remote
echo Starting Monarch Remote (PC + Phone Web Control)...
echo.
if exist "C:\Users\TATI\AppData\Local\antigravity\python\5a1c45aafcb841ee\python.exe" (
  "C:\Users\TATI\AppData\Local\antigravity\python\5a1c45aafcb841ee\python.exe" "C:\tvdiag\monarch_remote\remote_server.py" --tv 192.168.1.64 --port 8765
) else (
  python "C:\tvdiag\monarch_remote\remote_server.py" --tv 192.168.1.64 --port 8765
)
pause
