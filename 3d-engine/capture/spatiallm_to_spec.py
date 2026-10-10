"""Convert a SpatialLM layout (walls, doors, windows, boxes) into a room spec.

    python spatiallm_to_spec.py layout.txt ../rooms/<id>.json --id <id> --name "Room name"
        [--style warm-minimal] [--debug boxes.json] [--colors colors.json]

With --colors (from extract_colors.py) the room keeps its measured palette:
walls, floor tint, ceiling, bedding, desk, chair, rug and storage colors.

SpatialLM gives measured geometry but no "which way does it face" for most
objects (its boxes are symmetric), so facing is inferred from context:
  - beds: headboard against the nearest wall, along the long axis
  - desks, nightstands, storage: back to the nearest wall
  - chairs: toward the nearest desk/table
Positions and sizes come straight from the measurement; only the look (models,
materials, lighting) comes from our style presets.
"""

import argparse
import json
import math
import re
from pathlib import Path

ENTITY = re.compile(r"^(\w+?)_(\d+)=(\w+)\((.*)\)\s*$")


def parse(path: Path) -> dict:
    out = {"walls": {}, "doors": [], "windows": [], "boxes": []}
    for line in path.read_text().splitlines():
        m = ENTITY.match(line.strip())
        if not m:
            continue
        kind, idx, _, args = m.groups()
        p = [a.strip() for a in args.split(",")]
        if kind == "wall":
            ax, ay, az, bx, by, bz, h, t = map(float, p[:8])
            out["walls"][f"wall_{idx}"] = {"a": [ax, ay, az], "b": [bx, by, bz], "height": h, "thickness": t}
        elif kind in ("door", "window"):
            x, y, z, w, h = map(float, p[1:6])
            out[kind + "s"].append({"wall": p[0], "center": [x, y, z], "width": w, "height": h})
        elif kind == "bbox":
            x, y, z, ang, sx, sy, sz = map(float, p[1:8])
            out["boxes"].append({"label": p[0].lower(), "center": [x, y, z], "angle": ang, "size": [sx, sy, sz]})
    return out


STYLES = {
    "warm-minimal": {
        "materials": {
            "floor": {"texture": "laminate_floor_02", "tile": 2.0, "tint": [1.02, 1.0, 0.97], "rough_min": 0.35},
            "walls": {"texture": "white_plaster_02", "color": "#ebe7df", "tile": 1.5, "detail": True, "normal": 0.35},
            "ceiling": {"color": "#efeeea"},
            "baseboard": {"color": "#e8e5de", "height": 0.08},
        },
        "accent": "#b7ad9f",
        "environment": {"hdri": "balcony", "strength": 1.3, "rotation": 30, "sun": 5.0, "sun_angle": [74, -72]},
        "render": {"exposure": 0.15},
        "rug": {"texture": "curly_teddy_natural", "tile": 0.35, "tint": [1.0, 0.97, 0.92], "border": "#2b2b2b"},
    },
    "sleek-masculine": {
        "materials": {
            "floor": {"texture": "herringbone_parquet", "tile": 1.6, "tint": [1.0, 0.92, 0.84], "rough_min": 0.38},
            "walls": {"texture": "white_plaster_02", "color": "#5a6067", "tile": 2.0},
            "ceiling": {"color": "#e9e7e2"},
            "baseboard": {"color": "#1c1d1f", "height": 0.09},
        },
        "accent": None,
        "environment": {"hdri": "canary_wharf", "strength": 3.0, "rotation": 160, "sun": 6.0},
        "render": {"exposure": 0.6},
        "rug": {"texture": "wool_boucle", "color": "#8d877e"},
    },
}

# SpatialLM label keywords -> our builder. First match wins.
CATEGORY = [
    ("nightstand", "nightstand"), ("night_stand", "nightstand"), ("bedside", "nightstand"),
    ("bed", "bed"),
    ("desk", "desk"), ("table", "table"),
    ("chair", "chair"), ("stool", "chair"),
    ("sofa", "sofa"), ("couch", "sofa"),
    ("wardrobe", "storage"), ("closet", "storage"), ("cabinet", "storage"), ("dresser", "storage"),
    ("drawer", "storage"), ("shelf", "storage"), ("bookcase", "storage"), ("shelves", "storage"),
    ("monitor", "screen"), ("tv", "screen"), ("television", "screen"), ("computer", "screen"),
    ("plant", "plant"), ("flower", "plant"),
    ("rug", "rug"), ("carpet", "rug"), ("mat", "rug"),
    ("painting", "art"), ("picture", "art"), ("poster", "art"), ("frame", "art"), ("mirror", "art"),
    ("chandelier", "ceiling"), ("pendant", "ceiling"), ("ceiling", "ceiling"),
    ("lamp", "lamp"), ("light", "lamp"),
    ("curtain", "skip"), ("window", "skip"), ("door", "skip"),
]


def category(label: str) -> str:
    for key, cat in CATEGORY:
        if key in label:
            return cat
    return "unknown"


def rot_deg(fx: float, fy: float) -> float:
    """Our convention: rot 0 faces -y, 90 faces +x."""
    return round(math.degrees(math.atan2(fx, -fy)), 1)


FLOOR_TEXTURE_MEAN = {"laminate_floor_02": (0.612, 0.506, 0.392), "herringbone_parquet": (0.55, 0.40, 0.27)}


def hex_to_rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))


def apply_colors(spec, colors, boxes):
    """Swap style-preset colors for the ones measured from the scan."""
    m = spec["materials"]
    if colors.get("walls"):
        m["walls"]["color"] = colors["walls"]
        m.pop("accent_wall", None)  # only keep an accent wall if the real room has one
    if colors.get("ceiling"):
        m["ceiling"]["color"] = colors["ceiling"]
    tex = m["floor"].get("texture")
    if colors.get("floor") and tex in FLOOR_TEXTURE_MEAN:
        meas, mean = hex_to_rgb(colors["floor"]), FLOOR_TEXTURE_MEAN[tex]
        m["floor"]["tint"] = [round(min(1.6, max(0.5, a / b)), 3) for a, b in zip(meas, mean)]

    def measured(x, y, cats):
        """Color entry of the nearest measured box of one of these categories."""
        cand = [c for c in colors.get("boxes", []) if category(c["label"]) in cats and c.get("color")]
        return min(cand, key=lambda c: (c["center"][0] - x) ** 2 + (c["center"][1] - y) ** 2, default=None)

    for o in spec["objects"]:  # colors.json boxes and spec positions share room-local coords
        x, y = o["pos"][0], o["pos"][1]
        a = o["asset"]
        if a == "proc:bed" and (c := measured(x, y, {"bed"})):
            o["duvet"], o["sheet"], o["frame"] = c.get("top") or c["color"], c["color"], c.get("base") or c["color"]
        elif a == "proc:desk" and (c := measured(x, y, {"desk", "table"})):
            o["color"], o["frame"] = c.get("top") or c["color"], c.get("base") or c["color"]
        elif a == "proc:office_chair" and (c := measured(x, y, {"chair"})):
            o["color"] = o["accent"] = c["color"]
        elif a == "proc:rug" and (c := measured(x, y, {"rug"})):
            o.pop("tint", None), o.pop("border", None)
            o["color"] = c["color"]
        elif a == "proc:cabinet" and (c := measured(x, y, {"storage", "unknown"})):
            o["color"], o["oak_front"] = c["color"], False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("layout", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--style", default="warm-minimal", choices=list(STYLES))
    ap.add_argument("--debug", type=Path, help="write parsed walls/boxes (room coords) for view_pointcloud.py")
    ap.add_argument("--colors", type=Path, help="colors.json from extract_colors.py (measured palette)")
    args = ap.parse_args()

    L = parse(args.layout)
    walls = list(L["walls"].values())
    if walls:
        xs = [p for w in walls for p in (w["a"][0], w["b"][0])]
        ys = [p for w in walls for p in (w["a"][1], w["b"][1])]
        height = max(w["height"] for w in walls)
    else:  # no walls detected: frame the furniture with a margin
        xs = [b["center"][0] + s * b["size"][0] / 2 for b in L["boxes"] for s in (-1, 1)] or [0, 3]
        ys = [b["center"][1] + s * b["size"][1] / 2 for b in L["boxes"] for s in (-1, 1)] or [0, 3]
        xs, ys, height = [min(xs) - 0.4, max(xs) + 0.4], [min(ys) - 0.4, max(ys) + 0.4], 2.6
    ox, oy = min(xs), min(ys)
    W, D = round(max(xs) - ox, 3), round(max(ys) - oy, 3)
    H = round(min(max(height, 2.3), 3.2), 3)

    def local(p):
        return p[0] - ox, p[1] - oy

    def nearest_wall(x, y):
        d = {"left": x, "right": W - x, "front": y, "back": D - y}
        side = min(d, key=d.get)
        inward = {"left": (1, 0), "right": (-1, 0), "front": (0, 1), "back": (0, -1)}[side]
        return side, d[side], inward

    style = STYLES[args.style]
    spec = {
        "id": args.id,
        "name": args.name,
        "style": args.style,
        "units": "meters",
        "_source": f"Measured with SpatialLM from a scan ({args.layout.name}); converted by spatiallm_to_spec.py.",
        "_coords": "x = width (left to right), y = depth (front to back), z = up. rot: 0 faces the front (-y), 90 faces +x.",
        "room": {"width": W, "depth": D, "height": H},
        "render": style["render"],
        "materials": json.loads(json.dumps(style["materials"])),
        "openings": [],
        "environment": style["environment"],
        "objects": [],
    }

    for kind in ("windows", "doors"):
        for o in L[kind]:
            x, y = local(o["center"])
            side, _, _ = nearest_wall(x, y)
            along = y if side in ("left", "right") else x
            entry = {"type": kind[:-1], "wall": side, "center": round(along, 3),
                     "width": round(o["width"], 3), "height": round(o["height"], 3)}
            if kind == "windows":
                entry["sill"] = round(max(0.3, o["center"][2] - o["height"] / 2), 3)
                entry["blind"] = 0.55
            spec["openings"].append(entry)

    boxes = []
    for b in L["boxes"]:
        x, y = local(b["center"])
        sx, sy, sz = b["size"]
        a = b["angle"]
        ex, ey = (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))
        long_axis, long_len, short_len = (ex, sx, sy) if sx >= sy else (ey, sy, sx)
        boxes.append({**b, "x": x, "y": y, "cat": category(b["label"]), "long": long_axis,
                      "long_len": long_len, "short_len": short_len, "z0": b["center"][2] - sz / 2, "h": sz})

    desks = [b for b in boxes if b["cat"] in ("desk", "table")]
    objs, skipped = spec["objects"], []
    for b in boxes:
        x, y, cat = b["x"], b["y"], b["cat"]
        side, dist, inward = nearest_wall(x, y)
        pos = [round(x, 3), round(y, 3)]
        if cat == "bed":
            lx, ly = b["long"]
            # Headboard = the long-axis end closer to a wall.
            ends = [(x + lx * b["long_len"] / 2, y + ly * b["long_len"] / 2, -1),
                    (x - lx * b["long_len"] / 2, y - ly * b["long_len"] / 2, 1)]
            head = min(ends, key=lambda e: nearest_wall(e[0], e[1])[1])
            fx, fy = lx * head[2], ly * head[2]  # facing points from headboard to foot
            mw, ml = max(0.9, b["short_len"] - 0.1), max(1.8, b["long_len"] - 0.15)
            objs.append({"asset": "proc:bed", "pos": pos, "rot": rot_deg(fx, fy), "size": [round(mw, 2), round(ml, 2)]})
            hx, hy = x - fx * (ml / 2 - 0.25), y - fy * (ml / 2 - 0.25)
            objs.append({"asset": "proc:pillows", "pos": [round(hx, 3), round(hy, 3), 0.6], "rot": rot_deg(fx, fy)})
        elif cat in ("desk", "table"):
            objs.append({"asset": "proc:desk", "pos": pos, "rot": rot_deg(*inward),
                         "size": [round(b["long_len"], 2), round(b["short_len"], 2)]})
        elif cat == "chair":
            if desks:
                d = min(desks, key=lambda k: math.hypot(k["x"] - x, k["y"] - y))
                fx, fy = d["x"] - x, d["y"] - y
            else:
                fx, fy = W / 2 - x, D / 2 - y
            objs.append({"asset": "proc:office_chair", "pos": pos, "rot": rot_deg(fx, fy)})
        elif cat == "nightstand":
            objs.append({"asset": "polyhaven:side_table_01", "pos": pos, "rot": rot_deg(*inward)})
        elif cat == "storage":
            objs.append({"asset": "proc:cabinet", "pos": pos, "rot": rot_deg(*inward),
                         "size": [round(b["long_len"], 2), round(b["short_len"], 2), round(b["h"], 2)]})
        elif cat == "sofa":
            objs.append({"asset": "polyhaven:sofa_02", "pos": pos, "rot": rot_deg(*inward)})
        elif cat == "screen":
            objs.append({"asset": "proc:monitor", "pos": pos + [round(max(0.0, b["z0"]), 3)], "rot": rot_deg(*inward)})
        elif cat == "plant":
            objs.append({"asset": "polyhaven:potted_plant_01", "pos": pos, "rot": 0,
                         "scale": round(min(1.5, max(0.4, b["h"] / 1.35)), 2)})
        elif cat == "rug":
            objs.append({"asset": "proc:rug", "pos": pos, "rot": round(math.degrees(b["angle"]), 1),
                         "size": [round(b["size"][0], 2), round(b["size"][1], 2)], **style["rug"]})
        elif cat == "art":
            wpos = {"left": [0.02, y], "right": [W - 0.02, y], "front": [x, 0.02], "back": [x, D - 0.02]}[side]
            objs.append({"asset": "proc:framed_print", "pos": [round(wpos[0], 3), round(wpos[1], 3), round(b["center"][2], 3)],
                         "rot": rot_deg(*inward), "size": [round(max(0.3, b["long_len"]), 2), round(max(0.3, b["h"]), 2)],
                         "image": "art/print_arc.jpg"})
        elif cat == "ceiling":
            objs.append({"asset": "proc:ceiling_light", "pos": pos, "light": {"watts": 30, "kelvin": 2700}})
        elif cat == "lamp":
            objs.append({"asset": "proc:tripod_lamp", "pos": pos + [round(max(0.0, b["z0"]), 3)], "rot": 0})
        else:
            skipped.append(b["label"])
            if cat == "unknown" and b["h"] > 0.3 and b["z0"] < 0.3:  # keep the space occupied so the layout stays honest
                objs.append({"asset": "proc:cabinet", "pos": pos, "rot": rot_deg(*inward),
                             "size": [round(b["long_len"], 2), round(b["short_len"], 2), round(b["h"], 2)],
                             "_label": b["label"]})

    # Lighting: two recessed downlights along the long axis, unless a detected fixture is already close.
    found = [o["pos"] for o in objs if o["asset"] == "proc:ceiling_light"]
    for t in (0.33, 0.67):
        p = [round(W / 2, 2), round(D * t, 2)] if D >= W else [round(W * t, 2), round(D / 2, 2)]
        if any(math.hypot(p[0] - f[0], p[1] - f[1]) < 1.0 for f in found):
            continue
        objs.append({"asset": "proc:ceiling_light", "pos": p, "light": {"watts": 30, "kelvin": 2700}})
    if style["accent"] and any(o["asset"] == "proc:bed" for o in objs):
        bed = next(o for o in objs if o["asset"] == "proc:bed")
        bx, by = bed["pos"]
        spec["materials"]["accent_wall"] = {"wall": nearest_wall(bx, by)[0], "color": style["accent"]}

    spec["cameras"] = {
        "hero": {"pos": [round(W * 0.12, 2), round(D * 0.08, 2), 1.6], "target": [round(W * 0.65, 2), round(D * 0.8, 2), 0.7], "lens": 18},
        "corner": {"pos": [round(W * 0.9, 2), round(D * 0.92, 2), 1.6], "target": [round(W * 0.25, 2), round(D * 0.2, 2), 0.6], "lens": 18},
        "birdseye": {"pos": [round(W / 2, 2), round(-D * 0.6, 2), round(max(W, D) * 1.35, 2)],
                     "target": [round(W / 2, 2), round(D / 2, 2), 0.2], "lens": 28, "hide": ["ceiling", "wall_front"]},
    }
    if args.colors:
        apply_colors(spec, json.loads(args.colors.read_text()), boxes)
    args.out.write_text(json.dumps(spec, indent=2))
    print(f"room {W} x {D} x {H} m | {len(spec['openings'])} openings | {len(objs)} objects | skipped: {skipped or 'none'}")
    print(f"wrote {args.out}")

    if args.debug:  # walls/boxes in room coords, for view_pointcloud overlays
        dbg = {"walls": [{"a": [w["a"][0] - ox, w["a"][1] - oy], "b": [w["b"][0] - ox, w["b"][1] - oy]} for w in walls],
               "boxes": [{"label": b["label"], "center": [b["x"], b["y"]], "size": b["size"][:2], "angle": b["angle"]} for b in boxes],
               "origin": [ox, oy]}
        args.debug.write_text(json.dumps(dbg, indent=2))


if __name__ == "__main__":
    main()
