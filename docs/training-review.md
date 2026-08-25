# RunPod YOLO26m Training Review

Date: 2026-05-09

## Run

- Model: YOLO26m detection
- Dataset: SRuibo mapped YOLO dataset only
- Image size: 1024
- Epochs: 120
- GPU: RunPod RTX 4090
- Weights:
  - `data/models/sewer/yolo26m_1024/best.pt`
  - `data/models/sewer/yolo26m_1024/last.pt`

## Best Validation Metrics During Training

- Best mAP50-95: 0.3497 at epoch 113
- Best mAP50: 0.6034 at epoch 113
- Best precision: 0.82095 at epoch 117
- Best recall: 0.59856 at epoch 97

Final epoch 120:

- Precision: 0.77472
- Recall: 0.55467
- mAP50: 0.58889
- mAP50-95: 0.33569

## Final Val Evaluation On `best.pt`

Overall:

- Precision: 0.822
- Recall: 0.549
- mAP50: 0.603
- mAP50-95: 0.349

Per class:

| Class | Images | Instances | Precision | Recall | mAP50 | mAP50-95 |
|---|---:|---:|---:|---:|---:|---:|
| crack | 35 | 42 | 0.913 | 0.738 | 0.798 | 0.563 |
| joint_fault | 55 | 65 | 0.864 | 0.446 | 0.573 | 0.312 |
| roots | 39 | 51 | 0.812 | 0.569 | 0.608 | 0.299 |
| obstruction_or_other | 35 | 37 | 0.700 | 0.442 | 0.431 | 0.221 |

## Final Test Evaluation On `best.pt`

Overall:

- Precision: 0.742
- Recall: 0.525
- mAP50: 0.584
- mAP50-95: 0.263

Per class:

| Class | Images | Instances | Precision | Recall | mAP50 | mAP50-95 |
|---|---:|---:|---:|---:|---:|---:|
| crack | 36 | 43 | 0.926 | 0.581 | 0.708 | 0.354 |
| joint_fault | 50 | 62 | 0.595 | 0.379 | 0.384 | 0.189 |
| roots | 37 | 45 | 0.646 | 0.578 | 0.617 | 0.272 |
| obstruction_or_other | 39 | 41 | 0.803 | 0.561 | 0.627 | 0.238 |

## Critical Assessment

This is a useful external pretraining model, not a final in-domain sewer-inspection model.

Strong points:

- Training converged cleanly; losses decrease and validation metrics improve steadily.
- `crack` is the strongest class, especially on validation.
- Test performance is not collapsed, so the model is not only memorizing the validation split.
- Inference speed on RTX 4090 is fast enough for later video processing experiments.

Weak points:

- Recall is still too low for inspection use. Roughly half of relevant objects may be missed depending on class and threshold.
- `joint_fault` is weak on test: recall 0.379 and mAP50-95 0.189.
- `obstruction_or_other` remains broad and visually heterogeneous. It is expected to be unstable.
- The confusion matrices show many ground-truth objects falling into background, meaning missed detections are still the main problem.
- This model was trained on external SRuibo data, not the curated in-domain dataset. Domain transfer to in-domain footage must be tested visually.

## Recommendation

Use this `best.pt` as:

- external pretraining / bootstrap detector
- candidate proposal generator on in-domain ML-clean frames
- smoke-test model for the pipeline

Do not present it as a final production-quality sewer damage detector yet.

Next steps:

1. Stop the idle RunPod once results are confirmed locally.
2. Run predictions on in-domain ML-clean frames.
3. Review false positives and false negatives visually.
4. Add expert-confirmed in-domain boxes, especially `joint_fault`, `deposit`, and `connection_defect`.
5. Fine-tune on a stronger in-domain train/val/test split only after enough real labels exist.
