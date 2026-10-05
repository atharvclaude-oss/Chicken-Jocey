"""Compute the transform that makes a scanned room upright and life-size.

    python align_splat.py <work_dir>    e.g. ../captures-out/zeke-room

COLMAP's output has an arbitrary orientation and scale. We fix both from the
camera path: the phone was held roughly upright, so the average camera "up"
is the world's up; and it was held at about chest height (1.4 m) above the
floor, which gives real-world scale. Prints a `splat` config for scenes.ts.
"""

import json
import struct
import sys
from pathlib import Path

import numpy as np

EYE_HEIGHT = 1.4  # meters: typical phone height while filming


def read_cameras(images_bin: Path):
    """Camera centers and world-space up vectors from COLMAP images.bin."""
    centers, ups, fwds = [], [], []
    with open(images_bin, "rb") as f:
        (n,) = struct.unpack("<Q", f.read(8))
        for _ in range(n):
            _id, qw, qx, qy, qz, tx, ty, tz, _cam = struct.unpack("<idddddddi", f.read(64))
            while f.read(1) != b"\0":  # image name
                pass
            (n2d,) = struct.unpack("<Q", f.read(8))
            f.seek(n2d * 24, 1)
            R = quat_to_rot(qw, qx, qy, qz)
            centers.append(-R.T @ np.array([tx, ty, tz]))
            ups.append(R.T @ np.array([0.0, -1.0, 0.0]))  # COLMAP camera y points down
            fwds.append(R.T @ np.array([0.0, 0.0, 1.0]))
    return np.array(centers), np.array(ups), np.array(fwds)


def quat_to_rot(w, x, y, z):
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def read_ply_positions(path: Path) -> np.ndarray:
    with open(path, "rb") as f:
        header, props, count = b"", [], 0
        while not header.endswith(b"end_header\n"):
            line = f.readline()
            header += line
            parts = line.decode().split()
            if parts[:2] == ["element", "vertex"]:
                count = int(parts[2])
            elif parts and parts[0] == "property":
                props.append((parts[1], parts[2]))
        types = {"float": "<f4", "double": "<f8", "uchar": "u1", "int": "<i4", "uint": "<u4", "short": "<i2", "ushort": "<u2"}
        dtype = np.dtype([(name, types[t]) for t, name in props])
        data = np.frombuffer(f.read(count * dtype.itemsize), dtype=dtype, count=count)
    return np.stack([data["x"], data["y"], data["z"]], axis=1).astype(np.float64)


def rotation_to(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Rotation matrix taking unit vector a onto unit vector b."""
    a, b = a / np.linalg.norm(a), b / np.linalg.norm(b)
    v, c = np.cross(a, b), float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-8:
        return np.eye(3) if c > 0 else np.diag([1.0, -1.0, -1.0])
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1 / (1 + c))


def euler_xyz_deg(R: np.ndarray):
    """three.js 'XYZ' Euler angles (degrees) for rotation matrix R."""
    y = np.arcsin(np.clip(R[0, 2], -1, 1))
    if abs(R[0, 2]) < 0.9999:
        x, z = np.arctan2(-R[1, 2], R[2, 2]), np.arctan2(-R[0, 1], R[0, 0])
    else:
        x, z = np.arctan2(R[2, 1], R[1, 1]), 0.0
    return [round(float(np.degrees(a)), 2) for a in (x, y, z)]


def main():
    work = Path(sys.argv[1])
    centers, ups, fwds = read_cameras(work / "dataset" / "sparse" / "0" / "images.bin")
    pts = read_ply_positions(work / "room.ply")

    up = ups.mean(axis=0)
    R = rotation_to(up, np.array([0.0, 1.0, 0.0]))
    # Also turn the room so the average viewing direction faces -Z (three.js "forward").
    f = (R @ fwds.mean(axis=0))
    yaw = np.arctan2(f[0], -f[2])
    c, s = np.cos(-yaw), np.sin(-yaw)
    R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]) @ R

    cams = centers @ R.T
    p = pts @ R.T
    # Floor = low percentile of splat heights near the cameras (ignores stray floaters).
    near = np.linalg.norm(p[:, [0, 2]] - cams[:, [0, 2]].mean(axis=0), axis=1) < np.percentile(
        np.linalg.norm(cams[:, [0, 2]] - cams[:, [0, 2]].mean(axis=0), axis=1), 100) * 2.5
    floor = np.percentile(p[near, 1], 2)
    scale = EYE_HEIGHT / max(cams[:, 1].mean() - floor, 1e-6)

    # Final transform: world = scale * R @ x + t, with the floor at y=0 and cameras centered.
    cam_c = cams.mean(axis=0) * scale
    t = np.array([-cam_c[0], -floor * scale, -cam_c[2]])
    target = [0.0, 0.9, -1.2]
    config = {
        "rotation": euler_xyz_deg(R),
        "scale": round(float(scale), 4),
        "position": [round(float(v), 3) for v in t],
        "view": {"target": target, "overview": [0.0, 3.2, 2.2], "eye": [0.0, EYE_HEIGHT, 0.6]},
        "tags": [],
    }
    lo, hi = np.percentile(p * scale + t, 2, axis=0), np.percentile(p * scale + t, 98, axis=0)
    print("room extent (m, 2-98th pct):", np.round(hi - lo, 2))
    print(json.dumps(config, indent=2))


if __name__ == "__main__":
    main()
