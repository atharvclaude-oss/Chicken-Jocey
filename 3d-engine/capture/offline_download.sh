#!/usr/bin/env bash
# Run on WINDOWS (Git Bash). Downloads everything SpatialLM needs so WSL can
# install it offline from /mnt/c (WSL's own internet is broken on this PC: large
# inbound transfers stall on the USB Wi-Fi + Hyper-V NAT path).
set -uo pipefail
OUT="${1:-/c/Users/zeker/dev/wsl-offline}"
mkdir -p "$OUT/wheels" "$OUT/models"
cd "$OUT"

dl() { [ -s "$2" ] || curl -fL --retry 3 -o "$2" "$1"; echo "DL $2 $(stat -c%s "$2" 2>/dev/null)"; }

# 1. Python 3.11 for Linux (standalone build, no conda needed)
dl "https://github.com/astral-sh/python-build-standalone/releases/download/20241016/cpython-3.11.10+20241016-x86_64-unknown-linux-gnu-install_only.tar.gz" python311.tar.gz

# 2. torchsparse source
[ -d torchsparse ] || git clone --depth 1 https://github.com/mit-han-lab/torchsparse.git
echo "DL torchsparse $(ls torchsparse | wc -l) entries"

# 3. Linux wheels for Python 3.11 (pip can download for another platform)
cat > requirements.txt <<'EOF'
torch==2.4.1+cu124
torchvision==0.19.1+cu124
torchaudio==2.4.1+cu124
transformers>=4.41.2,<=4.46.1
safetensors>=0.4.5,<0.5
pandas>=2.2.3,<3
einops>=0.8.1,<0.9
numpy>=1.26,<2
scipy>=1.15.2,<2
scikit-learn>=1.6.1,<2
toml>=0.10.2
tokenizers>=0.19.0,<0.20.4
huggingface_hub>=0.25.0
rerun-sdk>=0.21.0,<0.22
shapely>=2.0.7,<3
terminaltables>=3.1.10,<4
open3d>=0.18.0,<0.19
addict>=2.4.0
setuptools
wheel
ninja
EOF
python -m pip download -r requirements.txt -d wheels \
  --platform manylinux_2_28_x86_64 --platform manylinux_2_17_x86_64 --platform manylinux2014_x86_64 \
  --platform manylinux_2_27_x86_64 --platform manylinux_2_31_x86_64 --platform any \
  --python-version 3.11 --implementation cp --abi cp311 --abi abi3 --abi none --only-binary=:all: \
  --extra-index-url https://download.pytorch.org/whl/cu124 > pip_download.log 2>&1
echo "WHEELS_EXIT $? $(ls wheels | wc -l) files"
# bbox has no wheel on PyPI: grab its (pure-Python) source package.
python -m pip download "bbox>=0.9.4,<0.10" --no-deps --no-binary :all: -d wheels >> pip_download.log 2>&1
echo "BBOX_EXIT $?"

# 4. Model weights (via huggingface_hub on Windows)
python -m pip install -q "huggingface_hub>=0.25" >> pip_download.log 2>&1
python - <<'EOF'
from huggingface_hub import snapshot_download
for repo in ("manycore-research/SpatialLM-Llama-1B", "manycore-research/SpatialLM-Qwen-0.5B"):
    try:
        p = snapshot_download(repo, local_dir=f"models/{repo.split('/')[1]}")
        print("MODEL_OK", repo, p)
    except Exception as e:
        print("MODEL_FAIL", repo, type(e).__name__, str(e)[:200])
EOF

# 5. CUDA 12.4 toolkit installer (largest, last)
dl "https://developer.download.nvidia.com/compute/cuda/12.4.1/local_installers/cuda_12.4.1_550.54.15_linux.run" cuda_12.4.1_linux.run
echo OFFLINE_DOWNLOAD_DONE
