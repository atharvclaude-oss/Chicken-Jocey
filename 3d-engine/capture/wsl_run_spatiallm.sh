#!/usr/bin/env bash
# Run SpatialLM on a point cloud (inside WSL, after wsl_install_offline.sh).
#   wsl -d Ubuntu -u root -- bash wsl_run_spatiallm.sh <in.ply> <out.txt> [model_dir] [seed]
# Paths may be Windows paths under /mnt/c/... . Output is SpatialLM's layout
# text (walls, doors, windows, bboxes) in the same coordinates as the input.
set -euo pipefail
source /opt/spatiallm-venv/bin/activate
export HF_HUB_OFFLINE=1
cd /root/SpatialLM
python inference.py \
  --point_cloud "$1" \
  --output "$2" \
  --model_path "${3:-/mnt/c/Users/zeker/dev/wsl-offline/models/SpatialLM-Llama-1B}" \
  --seed "${4:-42}"
echo "LAYOUT_DONE $2"
