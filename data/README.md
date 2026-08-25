# App runtime data

Runtime directory for the backend. Its contents are produced at run time and,
apart from this README, excluded via `.gitignore`.

- `uploads/` — uploaded videos
- `frames/` — sampled analysis frames
- `masks/` — reserved for future segmentation masks
- `reports/` — generated JSON reports
- `models/` — local checkpoints (see [`../DATA.md`](../DATA.md))
  - `models/sewer/` — your own Ultralytics weights
  - `models/iswds/` — ONNX models lazily downloaded from Hugging Face
- `training_smoke/` — output of the synthetic Ultralytics smoke training
- `inspection.sqlite3` — SQLite database

**No inspection videos, frames, or annotations belong in Git.** See
[`../DATA.md`](../DATA.md).
