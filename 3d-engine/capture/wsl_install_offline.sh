#!/usr/bin/env bash
# Install SpatialLM 1.0 inside WSL from files downloaded on Windows by
# offline_download.sh (WSL's own internet is unreliable on this PC).
#   wsl -d Ubuntu -u root -- bash /mnt/c/.../wsl_install_offline.sh
# Needs: gcc-13/g++-13 (apt), libsparsehash-dev (apt).
set -euxo pipefail
OFF=/mnt/c/Users/zeker/dev/wsl-offline
VENV=/opt/spatiallm-venv

# 1. Python 3.11 (standalone build) + venv
if [ ! -x /opt/py311/bin/python3 ]; then
  mkdir -p /opt/py311
  tar -xzf "$OFF/python311.tar.gz" -C /opt/py311 --strip-components=1
fi
[ -x "$VENV/bin/python" ] || /opt/py311/bin/python3 -m venv "$VENV"
source "$VENV/bin/activate"

# 2. Python packages, all from the local wheel folder (bbox, used only by eval.py, is skipped)
pip install --no-index --find-links "$OFF/wheels" -r "$OFF/requirements.txt"

# 3. CUDA 12.4 toolkit (compiler only, no driver: Windows' driver is used)
if [ ! -x /usr/local/cuda-12.4/bin/nvcc ]; then
  # The runfile wants a TTY (give it a pseudo-terminal via `script`) and
  # unpacks ~4 GB to a temp dir (WSL's /tmp is a small RAM disk, so use disk).
  mkdir -p /root/cuda-tmp
  script -qec "sh $OFF/cuda_12.4.1_linux.run --toolkit --silent --override --no-opengl-libs      --no-man-page --installpath=/usr/local/cuda-12.4 --tmpdir=/root/cuda-tmp" /root/cuda-install.log
  rm -rf /root/cuda-tmp
fi
export CUDA_HOME=/usr/local/cuda-12.4
export PATH="$CUDA_HOME/bin:$PATH"

# 4. torchsparse, compiled for the RTX 40-series with GCC 13
#    (Ubuntu 26.04's default GCC 15 is too new for CUDA 12.4).
export CC=gcc-13 CXX=g++-13 CUDAHOSTCXX=g++-13 NVCC_PREPEND_FLAGS="-ccbin g++-13"
export TORCH_CUDA_ARCH_LIST="8.9" FORCE_CUDA=1 MAX_JOBS=1
rm -rf /root/torchsparse-src && cp -r "$OFF/torchsparse" /root/torchsparse-src
pip install --no-index --no-build-isolation --no-deps /root/torchsparse-src

# 5. SpatialLM code (cloned on Windows)
[ -d /root/SpatialLM ] || cp -r /mnt/c/Users/zeker/dev/SpatialLM /root/SpatialLM

python -c "import torch, torchsparse; print('CHECK', torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0), torchsparse.__version__)"
echo INSTALL_DONE
