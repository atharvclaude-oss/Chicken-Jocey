"""Measure a room's real colors from its scan, so every rebuilt room keeps its own palette.

    python extract_colors.py ../captures-out/<name> [--extra extra_boxes.json]

Reads room_points.ply (colored, z-up, metric) and layout_debug.json (walls/boxes
from spatiallm_to_spec.py --debug, room-local coords + origin). Writes colors.json:

  {"walls": "#hex", "floor": "#hex", "ceiling": "#hex",
   "boxes": [{"label": "bed", "center": [x, y], "color": "#hex", "top": "#hex", "base": "#hex"}, ...]}

Video exposure varies, so colors are normalized: the whole palette is scaled so
the walls land at a typical painted-wall brightness. Hue/saturation are kept.
--extra adds boxes SpatialLM missed, in the same room-local format
({"label", "center": [x, y], "size": [sx, sy], "angle", "z": [z0, z1]}).
"""

import argparse
import json
from pathlib import Path

import numpy as np

from view_pointcloud import read_ply

WALL_TARGET = 0.86  # brightness a white-ish painted wall should end up at (sRGB, 0..1)


def to_hex(rgb):
    r, g, b = (int(round(np.clip(c, 0, 1) * 255)) for c in rgb)
    return f"#{r:02x}{g:02x}{b:02x}"


def inside_box(xy, z, b, shrink=0.85):
    c, s = np.cos(b["angle"]), np.sin(b["angle"])
    d = xy - np.array(b["center"])
    u = d[:, 0] * c + d[:, 1] * s      # along size[0]
    v = -d[:, 0] * s + d[:, 1] * c     # along size[1]
    m = (np.abs(u) < b["size"][0] * shrink / 2) & (np.abs(v) < b["size"][1] * shrink / 2)
    if "z" in b:
        m &= (z > b["z"][0]) & (z < b["z"][1])
    return m


def robust_color(rgb):
    """Median of the mid-brightness points: drops specular glints and shadow holes."""
    if len(rgb) < 30:
        return None
    lum = rgb @ [0.299, 0.587, 0.114]
    lo, hi = np.percentile(lum, [20, 85])
    keep = (lum >= lo) & (lum <= hi)
    return np.median(rgb[keep], axis=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("work", type=Path)
    ap.add_argument("--extra", type=Path)
    args = ap.parse_args()

    xyz, rgb = read_ply(args.work / "room_points.ply")
    rgb = rgb.astype(float) / 255.0
    dbg = json.loads((args.work / "layout_debug.json").read_text())
    ox, oy = dbg["origin"]
    xy = xyz[:, :2] - [ox, oy]
    z = xyz[:, 2] - np.percentile(xyz[:, 2], 1.5)

    walls = dbg["walls"]
    W = max(max(w["a"][0], w["b"][0]) for w in walls)
    D = max(max(w["a"][1], w["b"][1]) for w in walls)
    H = np.percentile(z, 99)

    boxes = [dict(b) for b in dbg["boxes"]]
    if args.extra:
        boxes += json.loads(args.extra.read_text())
    furniture = [b for b in boxes if b["label"] not in ("carpet", "rug", "curtain")]
    occupied = np.zeros(len(xyz), bool)
    for b in furniture:
        occupied |= inside_box(xy, z, {**b, "size": [b["size"][0] + 0.2, b["size"][1] + 0.2]}, shrink=1.0)

    # Wall band: near any of the four sides, mid height, not behind furniture.
    near = np.minimum.reduce([xy[:, 0], W - xy[:, 0], xy[:, 1], D - xy[:, 1]])
    wall_m = (np.abs(near) < 0.1) & (z > 0.5) & (z < H - 0.35) & ~occupied
    floor_m = (z < 0.04) & ~occupied
    for b in boxes:  # rugs are not floor
        if b["label"] in ("carpet", "rug"):
            floor_m &= ~inside_box(xy, z, b, shrink=1.0)
    ceil_m = z > H - 0.06

    wall = robust_color(rgb[wall_m])
    lum = float(wall @ [0.299, 0.587, 0.114])
    gain = float(np.clip(WALL_TARGET / max(lum, 1e-3), 0.8, 2.6))
    norm = lambda c: None if c is None else to_hex(c * gain)  # noqa: E731

    out = {"gain": round(gain, 3), "walls": norm(wall), "floor": norm(robust_color(rgb[floor_m])),
           "ceiling": norm(robust_color(rgb[ceil_m])), "boxes": []}
    for b in boxes:
        m = inside_box(xy, z, b)
        entry = {"label": b["label"], "center": [round(v, 3) for v in b["center"]], "color": norm(robust_color(rgb[m]))}
        if m.sum() > 60:  # top surface (bedding, desktop) vs lower body (frame, legs)
            zz = z[m]
            top = zz > np.percentile(zz, 70)
            entry["top"], entry["base"] = norm(robust_color(rgb[m][top])), norm(robust_color(rgb[m][zz < np.percentile(zz, 35)]))
        entry["points"] = int(m.sum())
        out["boxes"].append(entry)

    (args.work / "colors.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
