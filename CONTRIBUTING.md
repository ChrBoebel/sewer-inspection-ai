# Contributing

Thanks for taking an interest. Issues and pull requests are welcome.

## Before you start

**Never commit inspection footage, extracted frames, training mosaics
(`train_batch*.jpg`, `val_batch*.jpg`), contact sheets, datasets, or model
weights.** Real sewer inspection footage carries operator asset data — pipe
segment and manhole IDs, addresses, network attributes — burnt into the frame.
`.gitignore` covers the usual cases, but it is no substitute for looking at what
you are about to stage. See [`DATA.md`](DATA.md).

By contributing you agree that your contribution is licensed under AGPL-3.0,
like the rest of the project.

## Setup

The fastest path is Docker; see the [README](README.md#quickstart-docker-recommended).
Everything runs with the `placeholder` detector, so you do not need model
weights to work on the code.

## Before opening a pull request

Backend:

```bash
ruff check backend
pytest -q
```

Frontend (from `frontend/`):

```bash
npm run lint
npm run typecheck
npm run test
npm run e2e      # needs ffmpeg on PATH
```

CI runs all of these except `e2e` on every pull request.

## Conventions

- **Frontend layout:** `app/` holds routes only, `components/` holds reusable
  UI, `components/screens/` holds the `ViewLevel` screens, `lib/` holds logic
  and types. Import through the `@/` alias, not relative paths across
  directories.
- **Backend:** `ruff` enforces `E`, `F`, and `I` (import order) on
  `backend/app` and `backend/tests`. Line length 100.
- **UI strings are German**, code and comments are English. Do not mix.
- **Adding a detector model:** add a `ModelSpec` in
  `backend/app/analysis/model_registry.py` and wire its `detector_type` into
  `build_detector`. Nothing else should need to change.
- **New dependencies:** check the license first. A non-commercial or
  no-derivatives clause would break the dual-licensing model — see
  [`THIRD_PARTY.md`](THIRD_PARTY.md) — so ask before adding one.

## Pull requests

Keep them focused: one concern per PR. Describe what changes and why, and say
how you verified it. If the change is user-visible, a screenshot helps.

All changes require a review — see [`.github/CODEOWNERS`](.github/CODEOWNERS).

## Reporting bugs

Open an issue with the reproduction steps, what you expected, and what happened
instead. Include the backend log (`docker compose logs backend worker`) when the
analysis pipeline is involved.

For security issues, do **not** open a public issue — see
[`SECURITY.md`](SECURITY.md).
