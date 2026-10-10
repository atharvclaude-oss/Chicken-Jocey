#!/usr/bin/env bash
# One-time setup of SpatialLM 1.0 inside WSL2 Ubuntu (run as root).
#   wsl -d Ubuntu -u root -- bash /mnt/c/.../wsl_setup_spatiallm.sh
# Installs: build tools, Miniforge (Python 3.11 env "spatiallm"), CUDA 12.4
# toolkit (for compiling), SpatialLM + PyTorch 2.4.1, and torchsparse.
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

dpkg --configure -a || true  # recover from an interrupted earlier run
apt-get update -y
apt-get install -y build-essential git wget curl libsparsehash-dev

if [ ! -d /opt/conda ]; then
  wget -q https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh -O /tmp/miniforge.sh
  bash /tmp/miniforge.sh -b -p /opt/conda
fi
source /opt/conda/etc/profile.d/conda.sh
conda env list | grep -q '^spatiallm ' || conda create -y -n spatiallm python=3.11
conda activate spatiallm
conda install -y -c nvidia/label/cuda-12.4.0 cuda-toolkit
conda install -y -c conda-forge sparsehash
# Ubuntu 26.04 ships GCC 15, which CUDA 12.4's nvcc rejects (max GCC 13).
# Use GCC 12 from conda-forge for everything compiled below.
conda install -y -c conda-forge "gcc=12" "gxx=12"

cd /root
[ -d SpatialLM ] || git clone --depth 1 https://github.com/manycore-research/SpatialLM.git
cd SpatialLM
pip install poetry
poetry config virtualenvs.create false --local
poetry install --no-interaction

# Compile torchsparse for the RTX 40-series only (sm_89), with limited
# parallelism so it fits in WSL's default RAM.
export CUDA_HOME="$CONDA_PREFIX"
export CC="$CONDA_PREFIX/bin/gcc" CXX="$CONDA_PREFIX/bin/g++"
export CUDAHOSTCXX="$CXX" NVCC_PREPEND_FLAGS="-ccbin $CXX"
export TORCH_CUDA_ARCH_LIST="8.9"
export FORCE_CUDA=1
export MAX_JOBS=4
pip install --no-build-isolation git+https://github.com/mit-han-lab/torchsparse.git

python -c "import torch, torchsparse; print('CHECK', torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0), torchsparse.__version__)"
echo SETUP_DONE
