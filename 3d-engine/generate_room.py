"""Procedurally generate a living-room spec from a seed.

    python generate_room.py <seed> <id> <name>  ->  rooms/<id>.json

Every run with the same seed gives the same room. Dimensions, materials and
which pieces appear are random; the layout follows simple rules (sofa faces
the TV, coffee table sits in front of the sofa, rug under the table, lamps and
plants fill the corners). All furniture comes from Poly Haven (CC0).
"""
import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def face(dx, dy):
    """Rotation (degrees) that turns an object's front (-y) toward direction (dx, dy)."""
    return math.degrees(math.atan2(dx, -dy))


def main():
    seed, rid, name = int(sys.argv[1]), sys.argv[2], sys.argv[3]
    r = random.Random(seed)

    W = r.choice([4.4, 4.8, 5.2, 5.6])
    D = r.choice([4.2, 4.8, 5.2])
    H = 2.7
    wall_color = "#f4f2ee"
    floor_tex = r.choice(["herringbone_parquet", "dark_wooden_planks", "smooth_concrete_floor"])
    rug_color = r.choice(["#7d6b57", "#4f5a52", "#8c7f73", "#2e3440", "#a58d74"])
    art_images = ["art/living_art_01.png", "art/living_art_02.png", "art/living_art_03.png"]

    # Sofa on the back wall, TV on the front wall facing it.
    sx = W / 2 + r.uniform(-0.25, 0.25)
    sofa_y = D - 0.5
    tv_x = sx + r.uniform(-0.2, 0.2)
    table_y = sofa_y - 1.45
    table_x = sx
    side_dir = r.choice([-1, 1])

    objects = [
        {"asset": "polyhaven:sofa_02", "pos": [sx, sofa_y], "rot": 0, "productId": "living-sofa"},
        {"asset": "polyhaven:modern_coffee_table_01", "pos": [table_x, table_y], "rot": 0, "productId": "living-coffee-table"},
        {"asset": "proc:rug", "pos": [table_x, table_y - 0.25], "size": [2.6, 1.8], "texture": "wool_boucle",
         "color": rug_color, "productId": "living-rug"},
        {"asset": "polyhaven:modern_arm_chair_01", "pos": [table_x + side_dir * 1.35, table_y + 0.05],
         "rot": face(-side_dir, 0.2), "productId": "living-armchair"},
        {"asset": "polyhaven:side_table_01", "pos": [sx + side_dir * 1.25, sofa_y - 0.1], "rot": 0,
         "productId": "living-side-table"},
        {"asset": "polyhaven:ceramic_vase_03", "pos": [sx + side_dir * 1.25, sofa_y - 0.1, 0.5], "rot": 0,
         "productId": "living-vase"},
        {"asset": "polyhaven:modern_wooden_cabinet", "pos": [tv_x, 0.3], "rot": 180, "productId": "living-tv-stand"},
        {"asset": "proc:framed_print", "pos": [sx, D - 0.03, 1.55], "rot": 0, "size": [0.9, 1.15],
         "image": r.choice(art_images), "productId": "living-art"},
        {"asset": "proc:area_light", "pos": [W / 2, D / 2, H - 0.1], "size": 2.4, "watts": 45, "kelvin": 3000},
        {"asset": "polyhaven:modern_ceiling_lamp_01", "pos": [table_x, table_y], "hang": 1.9,
         "productId": "living-pendant", "light": {"watts": 60, "kelvin": 2800}},
    ]

    # Bookshelf on the left wall, plants in the corners nearest the window.
    objects.append({"asset": "polyhaven:wooden_bookshelf_worn", "pos": [0.25, D * 0.5], "rot": 90,
                    "productId": "living-bookshelf"})
    plant_a, plant_b = r.sample(["potted_plant_02", "potted_plant_04"], 2)
    objects.append({"asset": f"polyhaven:{plant_a}", "pos": [W - 0.35, 0.4], "rot": r.uniform(0, 360),
                    "productId": "living-plant-a"})
    objects.append({"asset": f"polyhaven:{plant_b}", "pos": [0.35, D - 0.35], "rot": r.uniform(0, 360),
                    "productId": "living-plant-b"})

    # Window on the right wall, centred on the free stretch of wall.
    win_center = r.uniform(D * 0.45, D * 0.75)
    room = {
        "id": rid,
        "name": name,
        "style": "living-room",
        "units": "meters",
        "_coords": "x = width, y = depth (front to back), z = up. rot 0 = faces -y.",
        "room": {"width": W, "depth": D, "height": H},
        "exposure": 1.5,
        "materials": {
            "floor": {"texture": floor_tex, "tile": 1.6, "tint": [1, 1, 1], "rough_min": 0.4},
            "walls": {"texture": None, "color": wall_color},
            "ceiling": {"color": "#f1efe9"},
            "baseboard": {"color": "#ece9e2", "height": 0.09},
        },
        "openings": [{"type": "window", "wall": "right", "center": round(win_center, 2), "width": 2.0,
                      "sill": 0.8, "height": 1.5}],
        "environment": {"hdri": "canary_wharf", "strength": 0.9, "rotation": r.uniform(0, 360), "sun": 5.0},
        "objects": objects,
        "cameras": {
            "hero": {"pos": [W - 0.35, 0.3, 1.7], "target": [W / 2, D * 0.55, 0.9], "lens": 24},
            "corner": {"pos": [0.4, 0.3, 1.6], "target": [W - 0.6, D - 0.6, 0.9], "lens": 24},
            "birdseye": {"pos": [W / 2, -2.4, 5.4], "target": [W / 2, D / 2, 0.4], "lens": 30,
                         "hide": ["ceiling", "wall_front"]},
        },
        "walk_start": {"x": round(W / 2 + 0.2, 2), "y": round(table_y - 1.2, 2),
                       "lookAt": {"x": round(sx, 2), "y": round(sofa_y - 0.2, 2)}},
    }
    (HERE / "rooms" / f"{rid}.json").write_text(json.dumps(room, indent=2), encoding="utf-8")
    print("wrote", rid, round(W, 2), round(D, 2), floor_tex, wall_color)


if __name__ == "__main__":
    main()
