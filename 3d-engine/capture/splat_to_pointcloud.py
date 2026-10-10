"""Turn a trained Gaussian-splat scan into the point cloud SpatialLM expects.

    python splat_to_pointcloud.py ../captures-out/zeke-room

Output (in the same work dir):
  room_points.ply      dense colored points, metric, z-up, walls axis-aligned
  room_transform.json  how to map those points back (for debugging/overlays)

Steps:
  1. Upright + real scale from the camera path (same logic as align_splat.py).
  2. Densify: sample several points inside each splat's Gaussian footprint,
     weighted by opacity, so surfaces become solid point sheets.
  3. "Manhattan" alignment: rotate about the vertical axis until wall points
     pile up into the sharpest x/y histograms, i.e. walls parallel to axes.
  4. Crop floaters outside the room.
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from align_splat import EYE_HEIGHT, read_cameras, rotation_to, world_up  # noqa: E402

SH_C0 = 0.28209479177387814


def read_splats(path: Path) -> dict:
    with open(path, "rb") as f:
        props, count = [], 0
        while True:
            line = f.readline().decode().strip()
            parts = line.split()
            if parts[:2] == ["element", "vertex"]:
                count = int(parts[2])
            elif parts and parts[0] == "property":
                props.append(parts[2])
            if line == "end_header":
                break
        dtype = np.dtype([(p, "<f4") for p in props])
        data = np.frombuffer(f.read(count * dtype.itemsize), dtype=dtype, count=count)
    return {p: data[p].astype(np.float64) for p in props}


def read_generic_ply(path: Path) -> dict:
    """Binary little-endian PLY with any float/double/uchar vertex properties."""
    types = {"float": "<f4", "float32": "<f4", "double": "<f8", "uchar": "u1", "uint8": "u1", "int": "<i4"}
    with open(path, "rb") as f:
        props, count = [], 0
        while True:
            line = f.readline().decode().strip()
            parts = line.split()
            if parts[:2] == ["element", "vertex"]:
                count = int(parts[2])
            elif parts and parts[0] == "property":
                props.append((parts[2], types[parts[1]]))
            if line == "end_header":
                break
        dtype = np.dtype(props)
        data = np.frombuffer(f.read(count * dtype.itemsize), dtype=dtype, count=count)
    return {name: data[name].astype(np.float64) for name, _ in props}


def quat_to_mats(w, x, y, z):
    n = np.sqrt(w * w + x * x + y * y + z * z) + 1e-12
    w, x, y, z = w / n, x / n, y / n, z / n
    return np.stack([
        np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], -1),
        np.stack([2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], -1),
        np.stack([2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)], -1),
    ], -2)


def yaw_from_normals(normals: np.ndarray, weights: np.ndarray) -> float:
    """Yaw that makes walls axis-aligned, from surface normals.

    Wall normals are horizontal and point along two perpendicular directions,
    so their azimuth modulo 90 degrees piles up at one angle. Rotating by minus
    that angle lines the walls up with x/y.
    """
    vertical = np.abs(normals[:, 2]) < 0.25
    az = np.degrees(np.arctan2(normals[vertical, 1], normals[vertical, 0])) % 90
    hist, edges = np.histogram(az, bins=180, range=(0, 90), weights=weights[vertical])
    hist = np.convolve(np.r_[hist[-3:], hist, hist[:3]], np.ones(7) / 7, mode="same")[3:-3]  # circular smoothing
    peak = edges[np.argmax(hist)] + 0.25
    return -np.radians(peak)


def manhattan_yaw(pts: np.ndarray) -> float:
    """Yaw (radians) that makes walls parallel to the x/y axes."""
    walls = pts[(pts[:, 2] > 0.4) & (pts[:, 2] < 1.9)]
    if len(walls) > 200_000:
        walls = walls[np.random.default_rng(0).choice(len(walls), 200_000, replace=False)]
    best, best_score = 0.0, -1.0
    for deg in np.arange(0, 90, 0.5):
        a = np.radians(deg)
        c, s = np.cos(a), np.sin(a)
        x = walls[:, 0] * c - walls[:, 1] * s
        y = walls[:, 0] * s + walls[:, 1] * c
        score = sum(float((np.histogram(v, bins=np.arange(v.min(), v.max() + 0.02, 0.02))[0] ** 2).sum()) for v in (x, y))
        if score > best_score:
            best, best_score = a, score
    return best


def refine_yaw(pts, step=0.5):
    """Extra rotation (rad) about z that best axis-aligns the walls, or 0.0 if
    the current alignment is already (nearly) the sharpest."""
    p = pts[(pts[:, 2] > 0.3) & (pts[:, 2] < 1.9), :2]
    if len(p) > 200_000:
        p = p[np.random.default_rng(0).choice(len(p), 200_000, replace=False)]

    def sharpness(deg):
        a = np.radians(deg)
        q = p @ np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]).T
        s = 0.0
        for k in (0, 1):
            h, _ = np.histogram(q[:, k], bins=np.arange(q[:, k].min(), q[:, k].max() + 0.03, 0.03))
            s += ((h / h.sum()) ** 2).sum()
        return s

    scores = {d: sharpness(d) for d in np.arange(-45, 45, step)}
    best = max(scores, key=scores.get)
    return float(np.radians(best)) if scores[best] > scores[0.0] * 1.03 else 0.0


def main():
    work = Path(sys.argv[1])
    per_splat = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 12
    use_dense = "--dense" in sys.argv
    s = None if use_dense else read_splats(work / "room.ply")  # dense mode needs no splat
    centers, ups, fwds = read_cameras(work / "dataset" / "sparse" / "0" / "images.bin")

    up = world_up(ups, read_cameras.rights)
    print("tilt between naive and level-axis up: %.1f deg" % np.degrees(np.arccos(np.clip(
        (ups.mean(0) / np.linalg.norm(ups.mean(0))) @ up, -1, 1))))
    R = rotation_to(up, np.array([0.0, 0.0, 1.0]))
    cams = centers @ R.T

    dense_path = work / "dense_fused.ply"
    if use_dense:
        # COLMAP multi-view stereo points: already dense, with normals.
        d = read_generic_ply(dense_path)
        raw = np.stack([d["x"], d["y"], d["z"]], 1)
        raw_n = np.stack([d["nx"], d["ny"], d["nz"]], 1)
        colors = np.stack([d["red"], d["green"], d["blue"]], 1) / 255.0
        p = raw @ R.T
        floor = np.percentile(p[:, 2], 1.5)
        scale = EYE_HEIGHT / max(cams[:, 2].mean() - floor, 1e-6)
        pts = p * scale
        normals, weights = raw_n @ R.T, np.ones(len(raw))
        print(f"dense points: {len(pts):,}")
    else:
        mean = np.stack([s["x"], s["y"], s["z"]], 1)
        opacity = 1 / (1 + np.exp(-s["opacity"]))
        scales = np.exp(np.stack([s["scale_0"], s["scale_1"], s["scale_2"]], 1))
        rgb = np.clip(0.5 + SH_C0 * np.stack([s["f_dc_0"], s["f_dc_1"], s["f_dc_2"]], 1), 0, 1)
        p = mean @ R.T
        keep = opacity > 0.35
        floor = np.percentile(p[keep, 2], 2)
        scale = EYE_HEIGHT / max(cams[:, 2].mean() - floor, 1e-6)
        # Drop faint and oversized splats (floaters, sky blobs).
        keep &= scales.max(1) * scale < 0.25
        print(f"splats kept: {keep.sum()} / {len(keep)}")
        # Densify inside each splat (in scan space, then transform).
        rng = np.random.default_rng(0)
        rot = quat_to_mats(s["rot_0"], s["rot_1"], s["rot_2"], s["rot_3"])[keep]
        sc, mu, col = scales[keep], mean[keep], rgb[keep]
        n = np.clip((opacity[keep] * per_splat).round().astype(int), 1, per_splat)
        idx = np.repeat(np.arange(len(mu)), n)
        local = np.clip(rng.standard_normal((len(idx), 3)), -1.5, 1.5) * sc[idx]
        pts = ((mu[idx] + np.einsum("nij,nj->ni", rot[idx], local)) @ R.T) * scale
        colors = col[idx]
        # Normals = each flat splat's thinnest axis.
        thin = np.argmin(sc, axis=1)
        normals = rot[np.arange(len(rot)), :, thin] @ R.T
        weights = opacity[keep] * (1 - sc.min(1) / (sc.max(1) + 1e-9))

    cam_xy = cams[:, :2].mean(0) * scale
    pts[:, :2] -= cam_xy
    pts[:, 2] -= floor * scale

    # Walls parallel to axes, from surface normals.
    yaw = yaw_from_normals(normals, weights)
    c, sn = np.cos(yaw), np.sin(yaw)
    Rz = np.array([[c, -sn, 0], [sn, c, 0], [0, 0, 1]])
    pts = pts @ Rz.T
    # Refine: noisy normals can leave the room turned (seen: 32 deg off). Search
    # the extra yaw that makes wall-height points pile into the sharpest x/y lines.
    extra = refine_yaw(pts)
    if extra:
        c, sn = np.cos(extra), np.sin(extra)
        pts = pts @ np.array([[c, -sn, 0], [sn, c, 0], [0, 0, 1]]).T
        yaw += extra
        print(f"yaw refined by {np.degrees(extra):.1f} deg")

    # 4. Crop floaters: keep the bulk of the room plus a small margin.
    lo = np.percentile(pts, 0.5, axis=0) - [0.15, 0.15, 0.05]
    hi = np.percentile(pts, 99.5, axis=0) + [0.15, 0.15, 0.05]
    inside = np.all((pts >= lo) & (pts <= hi), axis=1) & (pts[:, 2] > -0.05)
    pts, colors = pts[inside], colors[inside]
    ext = np.percentile(pts, 98, axis=0) - np.percentile(pts, 2, axis=0)
    print(f"points: {len(pts):,}  room extent (m, 2-98 pct): {np.round(ext, 2)}  yaw: {np.degrees(yaw):.1f} deg")

    out = work / "room_points.ply"
    rgb8 = (colors * 255).astype(np.uint8)
    vert = np.empty(len(pts), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("red", "u1"), ("green", "u1"), ("blue", "u1")])
    vert["x"], vert["y"], vert["z"] = pts[:, 0], pts[:, 1], pts[:, 2]
    vert["red"], vert["green"], vert["blue"] = rgb8[:, 0], rgb8[:, 1], rgb8[:, 2]
    with open(out, "wb") as f:
        f.write(f"ply\nformat binary_little_endian 1.0\nelement vertex {len(vert)}\n"
                "property float x\nproperty float y\nproperty float z\n"
                "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n".encode())
        f.write(vert.tobytes())
    (work / "room_transform.json").write_text(json.dumps({
        "up_rotation": R.tolist(), "scale": scale, "cam_xy": cam_xy.tolist(), "floor": floor * scale, "yaw_rad": yaw,
    }, indent=2))
    print("wrote", out)


if __name__ == "__main__":
    main()
