"""Download CC0 assets from Poly Haven (https://polyhaven.com) into a local cache.

Works with plain Python 3 or inside Blender. Files are cached, so re-running
is free. Usage:
    python polyhaven.py model modern_arm_chair_01
    python polyhaven.py texture herringbone_parquet
    python polyhaven.py hdri canary_wharf
"""

import json
import sys
import urllib.request
from pathlib import Path

CACHE = Path(__file__).resolve().parent.parent / ".cache" / "polyhaven"
API = "https://api.polyhaven.com"
UA = {"User-Agent": "roomcommerce-pipeline/0.1"}

# Texture maps we use, keyed by the name Poly Haven's API gives them.
TEXTURE_MAPS = {"Diffuse": "diff", "nor_gl": "nor", "Rough": "rough", "AO": "ao"}


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def _download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(_get(url))
    return dest


def _files(asset_id: str) -> dict:
    return json.loads(_get(f"{API}/files/{asset_id}"))


def model(asset_id: str, res: str = "1k") -> Path:
    """Download a model as glTF (+ .bin + textures). Returns the .gltf path."""
    entry = _files(asset_id)["gltf"][res]["gltf"]
    root = CACHE / "models" / asset_id
    for rel, info in entry.get("include", {}).items():
        _download(info["url"], root / rel)
    return _download(entry["url"], root / Path(entry["url"]).name)


def texture(asset_id: str, res: str = "2k") -> dict:
    """Download PBR maps. Returns {"diff": Path, "nor": Path, "rough": Path, "ao": Path}."""
    files = _files(asset_id)
    out = {}
    for api_name, short in TEXTURE_MAPS.items():
        if api_name in files and res in files[api_name]:
            url = files[api_name][res]["jpg"]["url"]
            out[short] = _download(url, CACHE / "textures" / asset_id / Path(url).name)
    return out


def hdri(asset_id: str, res: str = "2k") -> Path:
    url = _files(asset_id)["hdri"][res]["hdr"]["url"]
    return _download(url, CACHE / "hdris" / Path(url).name)


if __name__ == "__main__":
    kind, asset = sys.argv[1], sys.argv[2]
    print({"model": model, "texture": texture, "hdri": hdri}[kind](asset))
