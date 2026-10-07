"""Process queued room scans and publish them to the website.

    python process_job.py <job-id>     # one job
    python process_job.py --drain      # every job whose status is "queued"

Each upload lives in captures-in/<id>.mp4. Progress is written to
captures-out/<id>/status.json, which the website polls. A finished scan is
copied to frontend/public/models/splats/<id>.ply and listed in
frontend/services/captured-scenes.json, which the room carousel reads.
"""

import json
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = HERE.parent
REPO = ENGINE.parent
INBOX = ENGINE / "captures-in"
OUT = ENGINE / "captures-out"
SPLATS = REPO / "frontend" / "public" / "models" / "splats"
MANIFEST = REPO / "frontend" / "services" / "captured-scenes.json"
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{5,39}$")


def write_status(job_id: str, state: str, message: str = "", **extra):
    folder = OUT / job_id
    folder.mkdir(parents=True, exist_ok=True)
    data = {"id": job_id, "state": state, "message": message, "updated": datetime.now(timezone.utc).isoformat(), **extra}
    (folder / "status.json").write_text(json.dumps(data, indent=2), encoding="utf-8")


def read_status(job_id: str) -> dict:
    path = OUT / job_id / "status.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def run_step(cmd, job_id: str, log: Path) -> str:
    with open(log, "a", encoding="utf-8") as f:
        result = subprocess.run([str(c) for c in cmd], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        f.write(result.stdout)
    if result.returncode != 0:
        raise RuntimeError(f"{cmd[1]} failed (exit {result.returncode}); see {log.name}")
    return result.stdout


def process(job_id: str):
    video = INBOX / f"{job_id}.mp4"
    work = OUT / job_id
    log = work / "pipeline.log"
    work.mkdir(parents=True, exist_ok=True)
    log.write_text("", encoding="utf-8")
    try:
        write_status(job_id, "processing", "Extracting frames and reconstructing the camera path")
        run_step([sys.executable, HERE / "video_to_splat.py", video, "--frames", "220", "--steps", "50000"], job_id, log)

        write_status(job_id, "processing", "Aligning the scan to the room")
        out = run_step([sys.executable, HERE / "align_splat.py", OUT / job_id], job_id, log)
        config = json.loads(out[out.index("{"):])
        (work / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")

        write_status(job_id, "publishing", "Publishing to the website")
        SPLATS.mkdir(parents=True, exist_ok=True)
        shutil.copy2(work / "room.ply", SPLATS / f"{job_id}.ply")
        publish(job_id, config)
        write_status(job_id, "done", "Room is ready. Open the room carousel to see it.", scene=job_id)
    except Exception as exc:  # the status file is how the phone learns what went wrong
        write_status(job_id, "failed", str(exc))
        raise


def publish(job_id: str, config: dict):
    entries = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else []
    entries = [e for e in entries if e["id"] != job_id]
    view = config["view"]
    entries.append({
        "id": job_id,
        "name": f"Scanned room {datetime.now().strftime('%d %b %H:%M')}",
        "style": "From your photo",
        "splat": {
            "url": f"/models/splats/{job_id}.ply",
            "rotation": config["rotation"],
            "scale": config["scale"],
            "position": config["position"],
            "view": view,
            "tags": [],
        },
    })
    MANIFEST.write_text(json.dumps(entries, indent=2), encoding="utf-8")


def drain():
    OUT.mkdir(parents=True, exist_ok=True)
    while True:
        queued = sorted(
            p.name for p in OUT.iterdir()
            if p.is_dir() and read_status(p.name).get("state") == "queued" and ID_PATTERN.match(p.name)
        )
        if not queued:
            return
        job_id = queued[0]
        try:
            process(job_id)
        except Exception as exc:
            print(f"job {job_id} failed: {exc}", file=sys.stderr, flush=True)
        time.sleep(1)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    if sys.argv[1] == "--drain":
        drain()
        return
    job_id = sys.argv[1]
    if not ID_PATTERN.match(job_id):
        sys.exit("invalid job id")
    process(job_id)


if __name__ == "__main__":
    main()
