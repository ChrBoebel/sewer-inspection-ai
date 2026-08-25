#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "== RunPod Sewer guarded finetune v2 =="
date
pwd

echo "== Remove macOS AppleDouble metadata files from package =="
find . -name '._*' -type f -delete

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
PROJECT="runs_finetune_v2"
PROJECT_DIR="runs/detect/$PROJECT"
IMG_SIZE="${IMGSZ:-1024}"
BATCH_SIZE="${BATCH:-8}"
WORKER_COUNT="${WORKERS:-8}"

echo "== Dataset validation summary =="
python3 - <<'PY'
from pathlib import Path
from collections import Counter

root = Path("prepared_sewer_dataset/sewer_finetune_v1")
classes = {0: "crack", 1: "joint_fault", 2: "roots", 3: "deposit", 4: "obstruction_or_other"}
errors = []

for split in ["train", "val", "test"]:
    imgs = [p for p in list((root / "images" / split).glob("*.jpg")) + list((root / "images" / split).glob("*.png")) if not p.name.startswith("._")]
    labels = [p for p in (root / "labels" / split).glob("*.txt") if not p.name.startswith("._")]
    counts = Counter()
    pos = 0
    boxes = 0
    for img in imgs:
        if "review_original" in str(img):
            errors.append(f"original path in images: {img}")
        label = root / "labels" / split / f"{img.stem}.txt"
        if not label.exists():
            errors.append(f"missing label: {label}")
    for txt in labels:
        lines = [line.strip() for line in txt.read_text().splitlines() if line.strip()]
        if lines:
            pos += 1
        for idx, line in enumerate(lines, 1):
            parts = line.split()
            if len(parts) != 5:
                errors.append(f"bad yolo columns {txt}:{idx}: {line}")
                continue
            vals = [float(x) for x in parts]
            cls = int(vals[0])
            x, y, w, h = vals[1:]
            if cls not in classes:
                errors.append(f"bad class {txt}:{idx}: {cls}")
            if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1):
                errors.append(f"bad box {txt}:{idx}: {line}")
            counts[classes.get(cls, str(cls))] += 1
            boxes += 1
    print(split, "images", len(imgs), "labels", len(labels), "positive_files", pos, "boxes", boxes, "classes", dict(counts))

if errors:
    print("DATASET ERRORS:")
    for err in errors:
        print(err)
    raise SystemExit(2)
PY

run_train() {
  local name="$1"
  local epochs="$2"
  local lr0="$3"
  local patience="$4"
  local freeze="$5"
  local seed="$6"

  echo "== Train $name =="
  yolo detect train \
    model="$MODEL" \
    data="$DATA" \
    imgsz="$IMG_SIZE" \
    epochs="$epochs" \
    batch="$BATCH_SIZE" \
    device=0 \
    optimizer=AdamW \
    lr0="$lr0" \
    lrf=0.01 \
    weight_decay=0.0005 \
    patience="$patience" \
    freeze="$freeze" \
    mosaic=0.0 \
    mixup=0.0 \
    copy_paste=0.0 \
    close_mosaic=0 \
    cache=False \
    workers="$WORKER_COUNT" \
    plots=True \
    seed="$seed" \
    project="$PROJECT" \
    name="$name" \
    2>&1 | tee "train_${name}.log"

  local best="$PROJECT_DIR/$name/weights/best.pt"
  if [ ! -f "$best" ]; then
    echo "Missing best weights: $best" >&2
    exit 2
  fi

  echo "== Validate val split for $name =="
  yolo detect val \
    model="$best" \
    data="$DATA" \
    imgsz="$IMG_SIZE" \
    device=0 \
    split=val \
    plots=True \
    project="$PROJECT" \
    name="${name}_val_eval" \
    2>&1 | tee "val_${name}.log"

  echo "== Validate test split for $name =="
  yolo detect val \
    model="$best" \
    data="$DATA" \
    imgsz="$IMG_SIZE" \
    device=0 \
    split=test \
    plots=True \
    project="$PROJECT" \
    name="${name}_test_eval" \
    2>&1 | tee "test_${name}.log"

  echo "== Predict clean Sewer frames for $name =="
  yolo predict \
    model="$best" \
    source=prepared_sewer_dataset/review_clean_v2/frames/ml_clean_v2_safe \
    imgsz="$IMG_SIZE" \
    conf=0.25 \
    device=0 \
    save=True \
    save_txt=True \
    save_conf=True \
    project="$PROJECT" \
    name="${name}_predict_clean" \
    2>&1 | tee "predict_clean_${name}.log"

  echo "== Predict background Sewer frames for $name =="
  yolo predict \
    model="$best" \
    source=prepared_sewer_dataset/review_clean_v2/frames/background_v2_safe \
    imgsz="$IMG_SIZE" \
    conf=0.25 \
    device=0 \
    save=True \
    save_txt=True \
    save_conf=True \
    project="$PROJECT" \
    name="${name}_predict_background" \
    2>&1 | tee "predict_background_${name}.log"
}

run_train "basemodel_sewer_finetune_v2_guarded_lr5e5" 60 0.00005 15 20 42
# YOLO26 has too few trainable layers left with freeze=25 on this model;
# freeze=20 keeps the run conservative while preserving a valid gradient path.
run_train "basemodel_sewer_finetune_v2_guarded_lr1e5" 40 0.00001 10 20 43

echo "== Build strict comparison report =="
python3 - <<'PY'
from pathlib import Path
from collections import Counter, defaultdict
from PIL import Image, ImageDraw
import csv
import json
import math
import pandas as pd

root = Path(".")
project_dir = root / "runs/detect/runs_finetune_v2"
out = root / "guarded_v2_evaluation"
out.mkdir(exist_ok=True)
names = {
    0: "crack",
    1: "joint_fault",
    2: "roots",
    3: "deposit",
    4: "obstruction_or_other",
}
candidates = [
    "basemodel_sewer_finetune_v2_guarded_lr5e5",
    "basemodel_sewer_finetune_v2_guarded_lr1e5",
]

def best_metrics(name):
    csv_path = project_dir / name / "results.csv"
    if not csv_path.exists():
        return {}
    df = pd.read_csv(csv_path)
    df.columns = [c.strip() for c in df.columns]
    metric = "metrics/mAP50-95(B)"
    m50 = "metrics/mAP50(B)"
    rec = "metrics/recall(B)"
    prec = "metrics/precision(B)"
    idx = df[metric].idxmax()
    return {
        "best_epoch": int(df.loc[idx, "epoch"]),
        "best_map50_95": float(df.loc[idx, metric]),
        "best_map50": float(df.loc[idx, m50]),
        "best_precision": float(df.loc[idx, prec]),
        "best_recall": float(df.loc[idx, rec]),
        "last_epoch": int(df.iloc[-1]["epoch"]),
    }

def video_from_name(name):
    stem = Path(name).stem
    if stem.startswith("Beispielstrasse"):
        return "Beispielstrasse"
    if stem.startswith("ap_"):
        stem = stem[3:]
    if stem.startswith("yr_") or stem.startswith("hn_"):
        stem = stem[3:]
    parts = stem.split("_")
    if len(parts) >= 2 and parts[0].startswith("F"):
        return "_".join(parts[:2])
    return parts[0]

def summarize_predictions(label_dir):
    hit_files = 0
    detections = 0
    classes = Counter()
    by_video = Counter()
    confs = defaultdict(list)
    rows = []
    for txt in sorted(p for p in label_dir.glob("*.txt") if not p.name.startswith("._")):
        lines = [line.strip() for line in txt.read_text().splitlines() if line.strip()]
        if not lines:
            continue
        hit_files += 1
        video = video_from_name(txt.name)
        by_video[video] += 1
        for line in lines:
            parts = line.split()
            cls = int(float(parts[0]))
            conf = float(parts[-1]) if len(parts) >= 6 else float("nan")
            cls_name = names.get(cls, str(cls))
            classes[cls_name] += 1
            detections += 1
            if not math.isnan(conf):
                confs[cls_name].append(conf)
            rows.append({
                "image": txt.stem + ".jpg",
                "video_id": video,
                "class": cls_name,
                "confidence": conf,
                "raw_label": line,
            })
    return {
        "hit_files": hit_files,
        "detections": detections,
        "classes": dict(classes),
        "by_video": dict(by_video),
        "mean_conf": {k: round(sum(v) / len(v), 4) for k, v in confs.items()},
        "rows": rows,
    }

def make_sheet(image_dir, label_dir, output_path, max_images=64):
    hits = []
    for txt in sorted(p for p in label_dir.glob("*.txt") if not p.name.startswith("._")):
        if txt.read_text().strip():
            img = image_dir / f"{txt.stem}.jpg"
            if img.exists():
                hits.append(img)
    if not hits:
        return None
    hits = hits[:max_images]
    thumb_w, thumb_h = 320, 220
    cols = 4
    rows = math.ceil(len(hits) / cols)
    sheet = Image.new("RGB", (cols * thumb_w, rows * thumb_h), (245, 245, 245))
    draw = ImageDraw.Draw(sheet)
    for idx, img_path in enumerate(hits):
        im = Image.open(img_path).convert("RGB")
        im.thumbnail((thumb_w, thumb_h - 36))
        x = (idx % cols) * thumb_w
        y = (idx // cols) * thumb_h
        sheet.paste(im, (x + (thumb_w - im.width) // 2, y + 26))
        draw.rectangle([x, y, x + thumb_w - 1, y + 25], fill=(30, 30, 30))
        draw.text((x + 4, y + 5), img_path.name[:42], fill=(255, 255, 255))
        draw.rectangle([x, y, x + thumb_w - 1, y + thumb_h - 1], outline=(190, 190, 190))
    sheet.save(output_path, quality=90)
    return output_path

summary = []
all_rows = []
for candidate in candidates:
    clean_dir = project_dir / f"{candidate}_predict_clean"
    bg_dir = project_dir / f"{candidate}_predict_background"
    clean = summarize_predictions(clean_dir / "labels")
    bg = summarize_predictions(bg_dir / "labels")
    metrics = best_metrics(candidate)
    clean_sheet = make_sheet(clean_dir, clean_dir / "labels", out / f"{candidate}_clean_contact_sheet.jpg")
    bg_sheet = make_sheet(bg_dir, bg_dir / "labels", out / f"{candidate}_background_contact_sheet.jpg")
    accepted = (
        bg["hit_files"] <= 4
        and clean["detections"] > 0
        and clean["classes"].get("deposit", 0) / max(clean["detections"], 1) <= 0.5
        and metrics.get("best_map50_95", 0) > 0.098
        and metrics.get("best_recall", 0) > 0.142
    )
    row = {
        "candidate": candidate,
        **metrics,
        "clean_hit_frames": clean["hit_files"],
        "clean_detections": clean["detections"],
        "clean_classes": clean["classes"],
        "background_hit_frames": bg["hit_files"],
        "background_detections": bg["detections"],
        "background_classes": bg["classes"],
        "accepted_by_numeric_gate": accepted,
        "clean_contact_sheet": str(clean_sheet) if clean_sheet else "",
        "background_contact_sheet": str(bg_sheet) if bg_sheet else "",
    }
    summary.append(row)
    for pred_split, pred in [("clean", clean), ("background", bg)]:
        for det in pred["rows"]:
            det["candidate"] = candidate
            det["prediction_set"] = pred_split
            all_rows.append(det)

with (out / "detections.csv").open("w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["candidate", "prediction_set", "image", "video_id", "class", "confidence", "raw_label"])
    writer.writeheader()
    writer.writerows(all_rows)

(out / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))

report_lines = [
    "# Sewer Finetune v2 Guarded Evaluation",
    "",
    "Base model: `models/basemodel/basemodel.pt`",
    "",
    "Acceptance gates:",
    "",
    "- Background FP hit frames <= 4 / 56",
    "- Deposit share on clean detections <= 50%",
    "- Best validation mAP50-95 > 0.098",
    "- Best validation recall > 0.142",
    "",
    "| Candidate | Best epoch | Val mAP50-95 | Val recall | Clean hit frames | Clean detections | Clean classes | Background FP frames | Background detections | Numeric gate |",
    "|---|---:|---:|---:|---:|---:|---|---:|---:|---|",
]
for row in summary:
    report_lines.append(
        f"| `{row['candidate']}` | {row.get('best_epoch', '')} | {row.get('best_map50_95', 0):.5f} | {row.get('best_recall', 0):.5f} | "
        f"{row['clean_hit_frames']} / 259 | {row['clean_detections']} | `{row['clean_classes']}` | "
        f"{row['background_hit_frames']} / 56 | {row['background_detections']} | {row['accepted_by_numeric_gate']} |"
    )
report_lines += [
    "",
    "Decision rule: a candidate is not promoted unless it passes numeric gates and visual QA. If both fail, keep `models/basemodel/basemodel.pt`.",
]
(out / "sewer_finetune_v2_guarded_report.md").write_text("\n".join(report_lines) + "\n")

print(json.dumps(summary, indent=2, ensure_ascii=False))
PY

echo "== Archive =="
tar -czf runpod_sewer_finetune_v2_guarded_results.tar.gz \
  runs/detect/runs_finetune_v2 \
  guarded_v2_evaluation \
  *.log \
  prepared_sewer_dataset/sewer_finetune_v1/*.md \
  prepared_sewer_dataset/sewer_finetune_v1/*.csv \
  prepared_sewer_dataset/sewer_finetune_v1/*.yaml || true
ls -lh runpod_sewer_finetune_v2_guarded_results.tar.gz || true

echo "== Done =="
date
