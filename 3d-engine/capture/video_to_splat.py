"""Turn a phone video of a room into a photoreal Gaussian-splat 3D room.

    python video_to_splat.py ../../captures/my-room.mp4 [--frames 220] [--steps 30000]

Pipeline (all local, free, uses the GPU):
  1. ffmpeg   extracts frames; we keep the sharpest one in each time window
  2. COLMAP   works out where the camera was for every frame (structure-from-motion)
  3. Brush    trains the Gaussian splat on those posed frames
Output: 3d-engine/captures-out/<name>/room.ply (+ the intermediate COLMAP dataset).

Capture tips for users: walk slowly around the room, phone at chest height,
point it inward, keep moving (don't rotate in place), good lighting, no people.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat

PROGRAMS = Path.home() / "AppData/Local/Programs"
COLMAP = PROGRAMS / "colmap/bin/colmap.exe"
BRUSH = PROGRAMS / "brush/brush_app.exe"
OUT_ROOT = Path(__file__).resolve().parent.parent / "captures-out"


def run(cmd, **kw):
    print("\n$", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, **kw)


def duration(video: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(video)],
        check=True, capture_output=True, text=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


def sharpness(path: Path) -> float:
    """Variance of edges: blurry (motion-smeared) frames score low."""
    with Image.open(path) as im:
        im = im.convert("L")
        im.thumbnail((640, 640))
        return ImageStat.Stat(im.filter(ImageFilter.FIND_EDGES)).var[0]


def extract_frames(video: Path, work: Path, target: int) -> Path:
    raw, images = work / "raw", work / "images"
    for d in (raw, images):
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True, exist_ok=True)
    # Oversample 3x, then keep the sharpest frame from each group of 3.
    fps = max(1.0, 3 * target / duration(video))
    run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={fps:.3f},scale='if(gt(iw,ih),1600,-2)':'if(gt(iw,ih),-2,1600)'",
         "-qscale:v", "2", raw / "f_%05d.jpg"])
    frames = sorted(raw.glob("*.jpg"))
    kept = 0
    for i in range(0, len(frames), 3):
        best = max(frames[i:i + 3], key=sharpness)
        shutil.copy(best, images / f"{kept:05d}.jpg")
        kept += 1
    shutil.rmtree(raw)
    print(f"kept {kept} sharp frames of {len(frames)} extracted", flush=True)
    return images


def colmap(work: Path, images: Path) -> Path:
    db, sparse, dense = work / "colmap.db", work / "sparse", work / "dataset"
    db.unlink(missing_ok=True)
    shutil.rmtree(sparse, ignore_errors=True)
    shutil.rmtree(dense, ignore_errors=True)
    sparse.mkdir()
    run([COLMAP, "feature_extractor", "--database_path", db, "--image_path", images,
         "--ImageReader.camera_model", "OPENCV", "--ImageReader.single_camera", "1"])
    # Video frames are in order, so match each frame with its neighbours (plus loop detection).
    run([COLMAP, "sequential_matcher", "--database_path", db])
    run([COLMAP, "mapper", "--database_path", db, "--image_path", images, "--output_path", sparse])
    models = sorted(p for p in sparse.iterdir() if p.is_dir())
    if not models:
        sys.exit("COLMAP could not reconstruct the camera path. Re-record more slowly with more overlap.")
    # Largest model = the one that registered the most frames.
    best = max(models, key=lambda p: (p / "images.bin").stat().st_size)
    # Undistort to a pinhole camera, which every splat trainer accepts.
    run([COLMAP, "image_undistorter", "--image_path", images, "--input_path", best,
         "--output_path", dense, "--output_type", "COLMAP"])
    (dense / "sparse" / "0").mkdir(parents=True, exist_ok=True)
    for f in (dense / "sparse").glob("*.bin"):
        f.replace(dense / "sparse" / "0" / f.name)
    return dense


def train(dataset: Path, out: Path, steps: int):
    out.mkdir(parents=True, exist_ok=True)
    run([BRUSH, dataset, "--total-steps", steps, "--export-every", steps,
         "--export-path", out, "--export-name", "room.ply",
         "--max-splats", 2_000_000, "--max-resolution", 1600])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("--frames", type=int, default=220)
    ap.add_argument("--steps", type=int, default=30000)
    ap.add_argument("--skip-frames", action="store_true", help="reuse previously extracted frames")
    args = ap.parse_args()

    name = args.video.stem.lower().replace(" ", "-")
    work = OUT_ROOT / name
    work.mkdir(parents=True, exist_ok=True)
    images = work / "images" if args.skip_frames else extract_frames(args.video, work, args.frames)
    dataset = colmap(work, images)
    train(dataset, work, args.steps)
    print(f"\nDONE {work / 'room.ply'}")


if __name__ == "__main__":
    main()
