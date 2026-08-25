# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project shape

AI-assisted defect detection for sewer CCTV inspection videos, with a review
cockpit. Two layers sit side by side:

1. **`backend/`** — FastAPI (`app.main:app`), SQLite
   (`data/inspection.sqlite3`), RQ/Redis queue. Chain: uploads → analysis jobs →
   events → report.
2. **`frontend/`** — Next.js 16 / React 19 (App Router, TypeScript). Talks to
   the backend through `lib/api.ts` (REST + WebSocket).

`cloud_training/` holds RunPod bootstrap scripts for GPU training.

**Important: this repository contains no data and no model weights.** No videos,
frames, annotations, operator asset data, or `*.pt`/`*.onnx`. The default
detector is the `placeholder`. See `DATA.md`.

When working here: **never** commit inspection footage, extracted frames,
training mosaics (`train_batch*.jpg`, `val_batch*.jpg`), contact sheets,
datasets, or weights. `.gitignore` covers the usual cases but is no substitute
for thinking.

The UI strings are German — the project targets German utilities and parses
German camera overlays. Code, comments in new code, and documentation are
English.

## Local development

The repo deliberately avoids ports 3000/8000/6379 (frontend `13137`, backend
`18137`, Redis `16379`). Two interchangeable wrappers:

```bash
bash scripts/dev-docker.sh         # backend+worker+redis in containers, frontend local
bash scripts/stop-dev-docker.sh

bash scripts/dev-local.sh        # everything local — needs Python venv, ffmpeg, tesseract
bash scripts/stop-dev-local.sh
```

The Docker path is the low-friction default (`backend/Dockerfile` bakes in
ffmpeg/tesseract/opencv libs). The frontend is **never** containerized — Next.js
runs on the host so Turbopack hot reload stays intact.

Two queue modes matter:

- `APP_QUEUE_MODE=rq` (default for both wrappers) — needs Redis at `REDIS_URL`.
- `APP_QUEUE_MODE=sync` — analysis runs inline, used by tests and Playwright's
  `webServer` (`frontend/playwright.config.ts`). No Redis needed.

`backend/app/config.py` reads `APP_*` env vars for data dir, sample FPS, frame
stride, max frames, and job timeout. `APP_OVERLAY_CITIES` (comma-separated)
configures which place names the overlay parser anchors on.

## Tests / lint

Backend:

```bash
. .venv/bin/activate
pytest -q                                        # default suite (backend/tests)
pytest -q backend/tests/test_api.py::test_name   # single test
ruff check backend
```

Two opt-in markers (skipped without their env var, see `pyproject.toml` and
`backend/tests/conftest.py`):

- `RUN_TRAIN_SMOKE=1 pytest -m train_smoke` — runs `app.ml.train_smoke` on
  synthetic data, end to end. Needs `backend/requirements-ml.txt`.
- `RUN_EXTERNAL_MODEL=1 pytest -m external_model` — downloads ISWDS ONNX from
  Hugging Face into `data/models/iswds/` and runs a real inference smoke.

Frontend (from `frontend/`):

```bash
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm run test          # vitest (unit tests in lib/*.test.ts)
npm run e2e           # playwright; spins up a sync-mode backend itself
```

The `ruff` config (root `pyproject.toml`) only covers `backend/app` and
`backend/tests`.

## Backend architecture

Analysis flow: `upload → enqueue → worker → pipeline → events → report`

- `app/main.py` — FastAPI routes. Uploads land in `data/uploads/`, a
  browser-safe MP4 preview is generated via `analysis/video.py`, persistence
  through `Repository`. `POST /api/videos/{id}/analyze` creates a job and
  enqueues it; `GET /api/jobs/active` and `WS /api/jobs/{id}/stream` feed
  progress to the UI.
- `app/queue.py` — `enqueue_analysis_job` dispatches either to
  `app.worker.run_analysis_job` directly (sync) or via RQ.
- `app/worker.py` — RQ entrypoint. Loads job/video, calls `run_pipeline`, then
  `build_report`, updating job status throughout.
- `app/analysis/pipeline.py` — frame sampling (`analysis/video.sampled_frames`,
  controlled by `analysis_sample_fps` / `analysis_max_frames` /
  `analysis_frame_stride`), per-frame detection, persistence, then
  `event_engine.group_detections_into_events`.
- `app/analysis/model_registry.py` — central `ModelSpec` table.
  **`placeholder` is the default** (`DEFAULT_MODEL_ID`) because no weights ship
  with this repository. `sewer-hybrid-review` is a `RoutedEnsembleDetector`
  combining a YOLO26m checkpoint (crack/joint_fault/roots) with a YOLO26s
  fine-tune (crack/connection_defect/deposit) — both expected under
  `data/models/sewer/`, see `DATA.md`. ISWDS ONNX models are registered too and
  loaded lazily. Adding a model = add a `ModelSpec` and wire its
  `detector_type` into `build_detector`.
- `app/analysis/detectors.py` — `DamageDetector` protocol plus
  `PlaceholderDetector`, `OnnxYoloDetector`, `OnnxRtDetrDetector`,
  `YoloDetector`, `RoutedEnsembleDetector`.
- `app/repository.py` — single SQLite repo (videos / jobs / events / detections
  tables created in `initialize`). One connection per request; tests use a temp
  DB via fixtures.
- `app/reporting.py` — writes `data/reports/{video_id}.json` and returns the
  same payload from `GET /api/videos/{id}/report`.
- `app/location.py` — independent geocoding/OCR service behind
  `PATCH /api/videos/{id}/location` (manual edit) and
  `POST /api/videos/{id}/location/suggest` (auto-suggest). Coordinates come
  either from text in the first frames (Tesseract OCR — gracefully no-ops if
  `tesseract` is missing) or from Nominatim. State machine
  `missing → suggested → confirmed`; `normalize_location` is the gatekeeper.
  Geocode results are cached in the repo.
- `app/overlay.py` — parses the burnt-in camera overlay. Place names come from
  `APP_OVERLAY_CITIES`, not from the code.

Class taxonomy: `SEWER_CLASS_NAMES` in `model_registry.py` is the canonical list
(crack, joint_fault, roots, connection_defect, deposit,
obstruction_or_other). The `PlaceholderDetector` lists them in a different
order — keep that in mind when comparing class indices.

## Frontend architecture

`frontend/app/page.tsx` is the central client component of the cockpit. A
`ViewLevel = 0 | 1 | 2 | 3 | 4` switches between the screens (login/dashboard →
order overview → review board → finding popup → archive/stats). The screens live
in `frontend/components/screens/` (`LoginScreen`, `Dashboard`, `OrderOverview`,
`ReviewBoard`, `ArchivePage`, `StatsPage`), shared types and fixtures in
`frontend/lib/`, and reusable building blocks (`Badge`, `Btn`, `InspFrame`,
`VideoPopup`, `TopBar`, `Level3Popup`) in `frontend/components/`.

`MODEL_ID` in `lib/inspection-types.ts` decides which model the UI
requests — default `placeholder`. WebSocket progress runs through
`jobStreamUrl(jobId)`. The order overview embeds `VideoLocationMap`
(maplibre-gl) and a `LocationEditor` drawer; markers reflect the
`missing/suggested/confirmed` status from the backend. The only secondary route
is `app/reports/[id]/page.tsx`. `lib/types.ts` mirrors
`backend/app/schemas.py`; `lib/data.ts` holds fixture and taxonomy data.

`NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_WS_BASE_URL` are required at build
and run time — `dev-local.sh` points them at `127.0.0.1:18137`.

The login is a mock with no backend auth (plain-text fixture users in
`lib/inspection-types.ts`). Do not deploy without a real auth concept.

## License

Copyright © 2026 Christopher Böbel. AGPL-3.0, because Ultralytics YOLO is
AGPL-3.0. Commercial use goes through a separate license (`COMMERCIAL.md`).

Check new dependencies for license compatibility and keep `THIRD_PARTY.md`
current. A dependency with a non-commercial or no-derivatives clause would break
the dual-licensing model — ask first if in doubt.
