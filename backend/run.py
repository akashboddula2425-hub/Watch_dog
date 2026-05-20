"""Launcher for the Watchdog backend.

Pings http://127.0.0.1:8765/health first. If a backend is already serving,
exits cleanly (so `npm run dev` doesn't crash with WinError 10013 / EADDRINUSE
when something — Electron, a prior session, another terminal — already started
one). Otherwise spawns uvicorn with --reload.
"""

from __future__ import annotations

import socket
import subprocess
import sys
import urllib.error
import urllib.request

HOST = "127.0.0.1"
PORT = 8765


def backend_alive() -> bool:
    try:
        with socket.create_connection((HOST, PORT), timeout=0.5):
            pass
    except OSError:
        return False
    try:
        with urllib.request.urlopen(f"http://{HOST}:{PORT}/health", timeout=1.0) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def main() -> int:
    if backend_alive():
        print(f"[run.py] backend already running on {HOST}:{PORT}, skipping spawn")
        return 0
    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.app.main:app",
        "--reload",
        "--host",
        HOST,
        "--port",
        str(PORT),
    ]
    try:
        proc = subprocess.run(cmd)
        return proc.returncode
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
