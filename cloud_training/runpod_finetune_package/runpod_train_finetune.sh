#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "== RunPod Sewer basemodel finetune =="
date
pwd

echo "== GPU/system =="
nvidia-smi || true
python3 --version

echo "== Install Python dependencies =="
python3 -m pip install --break-system-packages -U pip
python3 -m pip install --break-system-packages -U ultralytics pandas pillow matplotlib

python3 - <<'PY'
from pathlib import Path
import torch
yaml_path = Path("prepared_sewer_dataset/sewer_finetune_v1/sewer_finetune_v1_runpod.yaml")
yaml_path.write_text("""path: prepared_sewer_dataset/sewer_finetune_v1
train: images/train
val: images/val
test: images/test

names:
  0: crack
  1: joint_fault
  2: roots
  3: deposit
  4: obstruction_or_other
""")
print("Torch:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("CUDA device:", torch.cuda.get_device_name(0))
    print("CUDA memory GB:", round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2))
print("RunPod YAML:", yaml_path)
PY

DATA="prepared_sewer_dataset/sewer_finetune_v1/sewer_finetune_v1_runpod.yaml"
MODEL="models/basemodel/basemodel.pt"
PROJECT="runs_finetune_runpod"
PROJECT_DIR="runs/detect/$PROJECT"
NAME="basemodel_sewer_finetune_v1_5090_smoke"

echo "== Dataset validation summary =="
cat prepared_sewer_dataset/sewer_finetune_v1/validation_report.md || true

echo "== Train conservative domain finetune =="
yolo detect train \
  model="$MODEL" \
  data="$DATA" \
  imgsz="${IMGSZ:-1024}" \
  epochs="${EPOCHS:-100}" \
  batch="${BATCH:-8}" \
  device=0 \
  optimizer=AdamW \
  lr0="${LR0:-0.0005}" \
  lrf=0.01 \
  weight_decay=0.0005 \
  patience="${PATIENCE:-25}" \
  cos_lr=True \
  close_mosaic=0 \
  mosaic=0.0 \
  mixup=0.0 \
  copy_paste=0.0 \
  cache=False \
  workers="${WORKERS:-8}" \
  plots=True \
  seed=42 \
  freeze=10 \
  project="$PROJECT" \
  name="$NAME" \
  2>&1 | tee "train_${NAME}.log"

BEST="$PROJECT_DIR/$NAME/weights/best.pt"
if [ ! -f "$BEST" ]; then
  echo "Missing best weights: $BEST" >&2
  exit 2
fi

echo "== Validate test split =="
yolo detect val \
  model="$BEST" \
  data="$DATA" \
  imgsz="${IMGSZ:-1024}" \
  device=0 \
  split=test \
  plots=True \
  project="$PROJECT" \
  name="${NAME}_test" \
  2>&1 | tee "test_${NAME}.log"

echo "== Archive =="
tar -czf runpod_sewer_finetune_results.tar.gz "$PROJECT_DIR" *.log prepared_sewer_dataset/sewer_finetune_v1/*.md prepared_sewer_dataset/sewer_finetune_v1/*.csv prepared_sewer_dataset/sewer_finetune_v1/*.yaml || true
ls -lh runpod_sewer_finetune_results.tar.gz || true

echo "== Done =="
date
echo "Best weights: $BEST"
