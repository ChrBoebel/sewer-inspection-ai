# Third-party licenses

This project is licensed under the **GNU AGPL-3.0** (see [`LICENSE`](LICENSE)).
The reason is Ultralytics: the backend imports `ultralytics`, and the intended
detector checkpoints come out of `yolo detect train`.

## Ultralytics YOLO — AGPL-3.0

Ultralytics offers two licenses:

- **AGPL-3.0** — any work that uses Ultralytics code *or models* must itself be
  licensed under AGPL-3.0 and make its source code publicly available. This
  explicitly includes software offered over a network.
- **Enterprise License** — paid, for commercial and proprietary use without the
  AGPL obligations.

Sources: <https://docs.ultralytics.com/help/contributing> and
<https://www.ultralytics.com/license>

**Consequence for downstream users:** taking this code into a proprietary
product requires an Ultralytics Enterprise License **and** a commercial license
for this code (see [`COMMERCIAL.md`](COMMERCIAL.md)). The AGPL of this
repository alone covers neither.

Ultralytics is installed as a runtime dependency
(`backend/requirements-ml.txt`); it is not vendored here.

## ISWDS models — Fair Non-Commercial Research License

`backend/app/analysis/model_registry.py` registers four ONNX models from
<https://huggingface.co/mogurlu/Istanbul_Sewer_Defect_Dataset_ISWDS_Models>.
They are **not** shipped with this repository — they are downloaded lazily on
first use.

License: Fair Non-Commercial Research License — research yes, commercial use
only with separately cleared rights. If you deploy this stack commercially, do
not use these models.

## External datasets (referenced, not included)

The training scripts in `cloud_training/` pull in two public datasets. Neither
is shipped with this repository; the scripts clone them at runtime:

- **SRuibo / Sewer-pipe-defects** —
  <https://huggingface.co/datasets/SRuibo/Sewer-pipe-defects>
- **aussup / Pipeline-Defect-Image-Dataset** —
  <https://github.com/aussup/Pipeline-Defect-Image-Dataset>

Check the license terms of these datasets at their source before using them,
especially commercially. They are neither reviewed nor warranted here.

## Other dependencies

Everything else is a common OSS package under MIT/BSD/Apache-2.0 (FastAPI,
Next.js, React, MapLibre GL, OpenCV, NumPy, Pillow, RQ, Redis, pytesseract,
Playwright, Vitest). Full lists: `backend/requirements*.txt` and
`frontend/package.json`.

Two system dependencies are expected but not bundled:

- **ffmpeg** — video decoding and preview transcoding
- **tesseract** (with `deu`/`eng`) — OCR of the camera overlays; if it is
  missing, `backend/app/location.py` degrades gracefully and continues without
  OCR

## Training data

None included. See [`DATA.md`](DATA.md).
