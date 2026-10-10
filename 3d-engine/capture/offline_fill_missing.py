"""Loop: dry-run the offline pip install inside WSL, download whatever it says
is missing (as a Linux wheel, on Windows), repeat until it resolves.

Needed because pip on Windows evaluates environment markers for Windows and
skips Linux-only dependencies when downloading for another platform.

    python offline_fill_missing.py
"""

import re
import subprocess

OFF_WIN = r"C:\Users\zeker\dev\wsl-offline"
OFF_WSL = "/mnt/c/Users/zeker/dev/wsl-offline"
MISSING = re.compile(r"No matching distribution found for ([A-Za-z0-9_.\-]+)([^;\s]*)")

for attempt in range(25):
    cmd = (f"source /opt/spatiallm-venv/bin/activate && pip install --dry-run --no-index "
           f"--find-links {OFF_WSL}/wheels -r {OFF_WSL}/requirements.txt 2>&1 | tail -5")
    out = subprocess.run(["wsl", "-d", "Ubuntu", "-u", "root", "--", "bash", "-c", cmd],
                         capture_output=True, text=True).stdout
    m = MISSING.search(out)
    if not m:
        print("RESOLVED" if "Would install" in out else out)
        break
    req = m.group(1) + m.group(2)
    print(f"[{attempt}] missing: {req}")
    r = subprocess.run(
        ["python", "-m", "pip", "download", req, "-d", rf"{OFF_WIN}\wheels", "--no-deps",
         "--platform", "manylinux2014_x86_64", "--platform", "manylinux_2_17_x86_64",
         "--platform", "manylinux_2_28_x86_64", "--platform", "linux_x86_64", "--platform", "any",
         "--python-version", "3.11", "--implementation", "cp", "--abi", "cp311", "--abi", "abi3",
         "--abi", "none", "--only-binary=:all:", "--extra-index-url", "https://download.pytorch.org/whl/cu124"],
        capture_output=True, text=True)
    if r.returncode != 0:
        print("download failed:", r.stdout[-400:], r.stderr[-400:])
        break
