"""Download Sketchfab models into a local cache for room builds.

    python sketchfab.py <uid>          # download one model, print its glTF path
    python sketchfab.py --credits      # list every cached model with author and licence

Needs SKETCHFAB_API_TOKEN (3d-engine/.env or the environment; get it from
sketchfab.com > Settings > Password & API). Only CC0 and CC-BY models are
accepted: they allow commercial use, and CC-BY just needs the author credited,
which is why each download keeps a meta.json (see --credits).
"""

import io
import json
import os
import sys
import urllib.request
import zipfile
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
CACHE = ENGINE / ".cache" / "sketchfab"
API = "https://api.sketchfab.com/v3"
# Licences that allow commercial use without restricting changes (we scale and bake every model).
ALLOWED = {"cc0", "by"}


def _token() -> str:
    token = os.environ.get("SKETCHFAB_API_TOKEN", "")
    env = ENGINE / ".env"
    if not token and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("SKETCHFAB_API_TOKEN="):
                token = line.split("=", 1)[1].strip()
    if not token:
        sys.exit("SKETCHFAB_API_TOKEN is not set (3d-engine/.env)")
    return token


def _get(url: str, auth: bool = False) -> bytes:
    headers = {"User-Agent": "room8-pipeline/0.1"}
    if auth:
        headers["Authorization"] = f"Token {_token()}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=300) as r:
        return r.read()


def info(uid: str) -> dict:
    """Licence, author and title, cached next to the model."""
    meta_path = CACHE / uid / "meta.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))
    m = json.loads(_get(f"{API}/models/{uid}"))
    meta = {
        "uid": uid,
        "name": m["name"],
        "author": m["user"]["displayName"],
        "author_url": m["user"]["profileUrl"],
        "license": m["license"]["slug"] if m.get("license") else "",
        "license_label": m["license"]["label"] if m.get("license") else "",
        "url": m["viewerUrl"],
        "faces": m.get("faceCount"),
    }
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def model(uid: str) -> Path:
    """Download (once) and return the model's .gltf path. Refuses non-commercial / no-derivative licences."""
    meta = info(uid)
    if meta["license"] not in ALLOWED:
        raise ValueError(f"{uid} '{meta['name']}' is {meta['license_label'] or 'unlicensed'}: only CC0 / CC-BY allowed")
    folder = CACHE / uid / "gltf"
    found = sorted(folder.rglob("*.gltf")) if folder.exists() else []
    if found:
        return found[0]
    links = json.loads(_get(f"{API}/models/{uid}/download", auth=True))
    archive = _get(links["gltf"]["url"])
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        for member in z.namelist():  # refuse paths that would escape the cache folder
            target = (folder / member).resolve()
            if not str(target).startswith(str(folder.resolve())):
                raise ValueError(f"unsafe path in archive: {member}")
        z.extractall(folder)
    found = sorted(folder.rglob("*.gltf"))
    if not found:
        raise FileNotFoundError(f"{uid}: archive has no .gltf")
    return found[0]


def credits() -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(CACHE.glob("*/meta.json"))]


if __name__ == "__main__":
    if sys.argv[1:] == ["--credits"]:
        for c in credits():
            print(f"{c['name']} by {c['author']} ({c['license_label']}) {c['url']}")
    else:
        print(model(sys.argv[1]))
