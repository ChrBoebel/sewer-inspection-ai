# Data and model weights

This repository contains **code only**. It deliberately contains no

- inspection videos,
- individual frames or training mosaics extracted from inspection videos,
- annotations or derived datasets,
- trained model weights (`*.pt`, `*.onnx`),
- operator asset data (pipe segment and manhole IDs, addresses, network
  attributes).

The project was built with footage from a sewer network operator. That material,
and everything derived from it, belongs to the operator and is not published
here.

## Interested in the trained weights?

The checkpoints trained on that footage are not published, because they are
derived from data I do not own. That does not mean the door is closed.

If you have a concrete use case — research, a pilot with your own network, an
evaluation — **get in touch: [@ChrBoebel](https://github.com/ChrBoebel)**, an
issue in this repository works fine. I will put the question to the network
operator; releasing the weights is their call, not mine, and I would rather ask
them on your behalf than have you guess who to contact.

Tell me what you want to do with them and in what context. Note that a release
would also have to work within the Ultralytics AGPL terms — see
[`THIRD_PARTY.md`](THIRD_PARTY.md).

If you have your own inspection footage, the section below gets you running
without any of this.

## Running without weights

The default is the `placeholder` detector: deterministic demo boxes, no ML
model. The app, the test suite, and the E2E suite all run fully with it — the
detections just are not real.

## Plugging in your own weights

`GET /api/models` lists the registered models. Two slots expect local
Ultralytics checkpoints:

| Model ID | Expected path | Image size |
| --- | --- | --- |
| `sewer-yolo26m` | `data/models/sewer/yolo26m_1024/best.pt` | 1024 |
| `sewer-hybrid-review` | additionally `data/models/sewer/yolo26s_finetune_640/last.pt` | 1024 + 640 |

`sewer-hybrid-review` is a `RoutedEnsembleDetector`: the YOLO26m model supplies
`crack`, `joint_fault`, and `roots`; the YOLO26s fine-tune (with a lower
confidence threshold) supplies `crack`, `connection_defect`, and `deposit`.

```bash
mkdir -p data/models/sewer/yolo26m_1024 data/models/sewer/yolo26s_finetune_640
cp /path/to/best.pt data/models/sewer/yolo26m_1024/best.pt
cp /path/to/last.pt data/models/sewer/yolo26s_finetune_640/last.pt
pip install -r backend/requirements-ml.txt
```

Then set `MODEL_ID` in `frontend/app/_lib/inspection-types.ts` to
`sewer-hybrid-review`, or pass `model_id` directly to
`POST /api/videos/{id}/analyze`.

Class taxonomy (`SEWER_CLASS_NAMES` in
`backend/app/analysis/model_registry.py`): `crack`, `joint_fault`, `roots`,
`connection_defect`, `deposit`, `obstruction_or_other`. The
`PlaceholderDetector` lists the same classes in a different order — keep that in
mind when comparing class indices.

## Training your own

`cloud_training/` holds the RunPod bootstrap scripts that produced the original
checkpoints. They expect a YOLO dataset under `prepared_sewer_dataset/` (not
included). `docs/training-review.md` documents the metrics of the original run
as a reference point.

## ISWDS models

Four ISWDS ONNX models are also registered and downloaded lazily from Hugging
Face into `data/models/iswds/` on first use. They are published under a **Fair
Non-Commercial Research License** — research only, no commercial use without
separately cleared rights. See [`THIRD_PARTY.md`](THIRD_PARTY.md).
