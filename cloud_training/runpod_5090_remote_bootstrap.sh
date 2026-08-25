#!/usr/bin/env bash
set -euo pipefail

cd /workspace/sewer_5090

echo "== RunPod 5090 remote bootstrap =="
date
pwd

echo "== System =="
nvidia-smi || true
df -h /workspace || true
python3 --version

echo "== Installing system tools =="
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git-lfs rsync
git lfs install

echo "== Installing Python tools =="
python3 -m pip install --break-system-packages -U pip
python3 -m pip install --break-system-packages -U ultralytics pandas pillow matplotlib huggingface_hub

echo "== Python/CUDA check =="
python3 - <<'PY'
import torch
print("Torch:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("CUDA device:", torch.cuda.get_device_name(0))
    print("CUDA capability:", torch.cuda.get_device_capability(0))
    print("CUDA memory GB:", round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2))
PY

mkdir -p external_datasets prepared_sewer_dataset/external_pretraining

echo "== Download SRuibo from Hugging Face =="
if [ ! -d external_datasets/sruibo_sewer_pipe_defects_hf ]; then
  git clone https://huggingface.co/datasets/SRuibo/Sewer-pipe-defects external_datasets/sruibo_sewer_pipe_defects_hf
else
  echo "SRuibo already present"
fi
git -C external_datasets/sruibo_sewer_pipe_defects_hf lfs pull || true

echo "== Download Pipeline-Defect-Image-Dataset from GitHub =="
if [ ! -d external_datasets/Pipeline-Defect-Image-Dataset ]; then
  git clone --depth 1 https://github.com/aussup/Pipeline-Defect-Image-Dataset.git external_datasets/Pipeline-Defect-Image-Dataset
else
  echo "Pipeline dataset already present"
fi
git -C external_datasets/Pipeline-Defect-Image-Dataset lfs pull || true

echo "== Dataset source sizes =="
du -sh external_datasets/* || true

echo "== Build mapped YOLO datasets =="
python3 tools/build_external_sruibo_dataset.py \
  --source-root "external_datasets/sruibo_sewer_pipe_defects_hf/Sewer pipe defects" \
  --output-root prepared_sewer_dataset/external_pretraining/sruibo_mapped_yolo

python3 tools/prepare_pipeline_external_dataset.py \
  --source-root external_datasets/Pipeline-Defect-Image-Dataset \
  --output-root prepared_sewer_dataset/external_pretraining/pipeline_mapped_yolo

python3 tools/build_external_combined_dataset.py \
  --sruibo-root prepared_sewer_dataset/external_pretraining/sruibo_mapped_yolo \
  --pipeline-root prepared_sewer_dataset/external_pretraining/pipeline_mapped_yolo \
  --output-root prepared_sewer_dataset/external_pretraining/combined_sruibo_pipeline_yolo

echo "== Combined dataset summary =="
cat prepared_sewer_dataset/external_pretraining/combined_sruibo_pipeline_yolo/README_COMBINED_EXTERNAL.md

DATA="$PWD/prepared_sewer_dataset/external_pretraining/combined_sruibo_pipeline_yolo/combined_external.yaml"
PROJECT="$PWD/runs_5090"
EVAL_PROJECT="$PWD/runs_5090_eval"

echo "== Check YOLO26m availability =="
python3 - <<'PY'
from ultralytics import YOLO
YOLO("yolo26m.pt")
print("YOLO26m ready")
PY

run_train() {
  local model="$1"
  local imgsz="$2"
  local batch="$3"
  local epochs="$4"
  local name="$5"
  echo "== Training ${model} imgsz=${imgsz} batch=${batch} epochs=${epochs} =="
  yolo detect train \
    model="$model" \
    data="$DATA" \
    imgsz="$imgsz" \
    epochs="$epochs" \
    batch="$batch" \
    device=0 \
    optimizer=auto \
    cache=disk \
    workers="${WORKERS:-12}" \
    patience="${PATIENCE:-40}" \
    cos_lr=True \
    close_mosaic=20 \
    plots=True \
    seed=42 \
    project="$PROJECT" \
    name="$name" \
    2>&1 | tee "$PWD/train_${name}.log"
}

NAME_M="combined_yolo26m_1280_5090"
set +e
run_train yolo26m.pt 1280 "${BATCH_M:-12}" "${EPOCHS_M:-180}" "$NAME_M"
STATUS=${PIPESTATUS[0]}
set -e

if [ "$STATUS" -ne 0 ]; then
  echo "== First 1280 run failed with status $STATUS. Retrying batch=8. =="
  NAME_M="combined_yolo26m_1280_5090_batch8_retry"
  set +e
  run_train yolo26m.pt 1280 8 "${EPOCHS_M:-180}" "$NAME_M"
  STATUS=${PIPESTATUS[0]}
  set -e
fi

if [ "$STATUS" -ne 0 ]; then
  echo "== 1280 run failed. Retrying safer imgsz=1024 batch=12. =="
  NAME_M="combined_yolo26m_1024_5090_retry"
  run_train yolo26m.pt 1024 12 "${EPOCHS_M:-180}" "$NAME_M"
fi

BEST="$PROJECT/$NAME_M/weights/best.pt"
if [ ! -f "$BEST" ]; then
  echo "Best weights not found: $BEST"
  exit 2
fi

echo "== Validation val split =="
yolo detect val \
  model="$BEST" \
  data="$DATA" \
  imgsz=1280 \
  device=0 \
  split=val \
  plots=True \
  project="$EVAL_PROJECT" \
  name="${NAME_M}_val" \
  2>&1 | tee "$PWD/val_${NAME_M}.log"

echo "== Validation test split =="
yolo detect val \
  model="$BEST" \
  data="$DATA" \
  imgsz=1280 \
  device=0 \
  split=test \
  plots=True \
  project="$EVAL_PROJECT" \
  name="${NAME_M}_test" \
  2>&1 | tee "$PWD/test_${NAME_M}.log"

echo "== Archive results =="
tar -czf "$PWD/runpod_5090_results.tar.gz" runs_5090 runs_5090_eval *.log prepared_sewer_dataset/external_pretraining/combined_sruibo_pipeline_yolo/*.yaml prepared_sewer_dataset/external_pretraining/combined_sruibo_pipeline_yolo/*.md || true
ls -lh "$PWD/runpod_5090_results.tar.gz" || true

echo "== Done =="
date
echo "Best weights: $BEST"
