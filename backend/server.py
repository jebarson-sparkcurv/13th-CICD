import shutil
import subprocess
import time

subprocess.run(["service", "postgresql", "start"], check=False, capture_output=True)
if shutil.which("pg_isready"):
    for _ in range(15):
        if subprocess.run(["pg_isready", "-q"], check=False).returncode == 0:
            break
        time.sleep(1)

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

from app.main import app  # noqa: E402,F401
