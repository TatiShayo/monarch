import os
import shutil
import zipfile
from pathlib import Path

SRC = Path(r"C:\Users\TATI\.gemini\antigravity\brain\bea5e5f7-c22f-4413-8b6c-70222824c7e0\imported_toolkit\tv-toolkit\usb-shelf")
DL_DEST = Path(r"C:\Users\TATI\Downloads\usb-shelf")
WGT_OUT = SRC / "usb-shelf.wgt"
STAGE_WGT = Path(r"C:\tvdiag\tizen_apps\usb-shelf.wgt")

FILES = ["index.html", "style.css", "app.js", "config.xml", "icon.png"]

with zipfile.ZipFile(WGT_OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for fn in FILES:
        p = SRC / fn
        assert p.is_file(), f"Missing required package file: {p}"
        zf.write(p, arcname=fn)

with zipfile.ZipFile(WGT_OUT, "r") as zf:
    names = zf.namelist()
    print("WGT contents:", names)
    assert sorted(names) == sorted(FILES), f"Unexpected entries: {names}"

STAGE_WGT.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(WGT_OUT, STAGE_WGT)

DL_DEST.mkdir(parents=True, exist_ok=True)
for p in SRC.iterdir():
    if p.is_file():
        shutil.copy2(p, DL_DEST / p.name)

print(f"Built {WGT_OUT} ({WGT_OUT.stat().st_size} bytes)")
print(f"Copied to {STAGE_WGT} ({STAGE_WGT.stat().st_size} bytes)")
print(f"Synced folder to {DL_DEST}")
