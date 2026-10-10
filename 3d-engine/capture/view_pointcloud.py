"""Quick 2D previews of a z-up point cloud: top view, plus front and side.

    python view_pointcloud.py room_points.ply out.png [boxes.json]

Draws optional SpatialLM boxes/walls (as parsed by spatiallm_to_spec.py) on the
top view, so you can check detected positions against the scan.
"""

import json
import sys

import numpy as np
from PIL import Image, ImageDraw


def read_ply(path):
    with open(path, "rb") as f:
        props, count = [], 0
        while True:
            line = f.readline().decode().strip()
            parts = line.split()
            if parts[:2] == ["element", "vertex"]:
                count = int(parts[2])
            elif parts and parts[0] == "property":
                props.append((parts[1], parts[2]))
            if line == "end_header":
                break
        types = {"float": "<f4", "uchar": "u1", "double": "<f8"}
        dt = np.dtype([(n, types[t]) for t, n in props])
        d = np.frombuffer(f.read(count * dt.itemsize), dtype=dt, count=count)
    xyz = np.stack([d["x"], d["y"], d["z"]], 1).astype(float)
    rgb = np.stack([d["red"], d["green"], d["blue"]], 1) if "red" in d.dtype.names else np.full((count, 3), 200)
    return xyz, rgb


def project(xyz, rgb, a, b, px=120, order=None):
    """Splat points onto a 2D canvas (axes a, b), nearest-first by `order`."""
    lo = xyz[:, [a, b]].min(0)
    hi = xyz[:, [a, b]].max(0)
    W, H = ((hi - lo) * px).astype(int) + 1
    img = np.full((H, W, 3), 245, np.uint8)
    idx = np.argsort(order) if order is not None else np.arange(len(xyz))
    u = ((xyz[idx, a] - lo[0]) * px).astype(int)
    v = (H - 1 - (xyz[idx, b] - lo[1]) * px).astype(int)
    img[v, u] = rgb[idx]
    return Image.fromarray(img), lo, px, H


def main():
    xyz, rgb = read_ply(sys.argv[1])
    top, lo, px, H = project(xyz, rgb, 0, 1, order=xyz[:, 2])  # higher points drawn last
    if len(sys.argv) > 3:
        d = ImageDraw.Draw(top)
        data = json.load(open(sys.argv[3]))
        ox, oy = data.get("origin", [0.0, 0.0])  # debug coords are room-local; shift back to scan coords
        to = lambda x, y: ((x + ox - lo[0]) * px, H - 1 - (y + oy - lo[1]) * px)
        for w in data.get("walls", []):
            d.line([to(w["a"][0], w["a"][1]), to(w["b"][0], w["b"][1])], fill=(0, 0, 255), width=3)
        for bx in data.get("boxes", []):
            cx, cy, sx, sy, ang = bx["center"][0], bx["center"][1], bx["size"][0], bx["size"][1], bx["angle"]
            c, s = np.cos(ang), np.sin(ang)
            corners = [(cx + c * dx - s * dy, cy + s * dx + c * dy) for dx, dy in
                       ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2))]
            d.polygon([to(*p) for p in corners], outline=(255, 0, 0), width=3)
            d.text(to(cx, cy), bx["label"], fill=(200, 0, 0))
    front, *_ = project(xyz, rgb, 0, 2, order=-xyz[:, 1])
    side, *_ = project(xyz, rgb, 1, 2, order=xyz[:, 0])
    W = top.width + max(front.width, side.width) + 30
    Hh = max(top.height, front.height + side.height + 20)
    canvas = Image.new("RGB", (W, Hh), "white")
    canvas.paste(top, (0, 0))
    canvas.paste(front, (top.width + 20, 0))
    canvas.paste(side, (top.width + 20, front.height + 20))
    canvas.save(sys.argv[2])
    print("saved", sys.argv[2], canvas.size)


if __name__ == "__main__":
    main()
