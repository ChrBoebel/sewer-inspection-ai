# Security policy

## This is not production software

Read this before deploying anything from this repository:

- **There is no authentication.** The login screen is a mock. Users are a
  plain-text fixture in `frontend/lib/inspection-types.ts` with the password
  `123456`, and the backend does not check anything at all. Every API route is
  open.
- **Uploads are unauthenticated and unbounded.** `POST /api/videos` accepts any
  file from anyone who can reach the port.
- **CORS defaults to local development origins** (`APP_ALLOWED_ORIGINS`).
- **The SQLite database and uploaded videos live on the local filesystem** under
  `data/`, unencrypted.

The development scripts bind to `127.0.0.1` deliberately. Exposing this stack to
a network without putting real authentication, authorization, upload limits, and
transport security in front of it would be a mistake.

None of the above are bugs to report — they are known properties of a
demonstrator. What *is* worth reporting is anything beyond this: a way to
escape the data directory, execute code through a crafted upload, or reach data
the design does not intend to expose.

## Reporting a vulnerability

Please do **not** open a public issue.

Use GitHub's private reporting: **Security → Report a vulnerability** on this
repository. If that is unavailable, contact
[@ChrBoebel](https://github.com/ChrBoebel) directly.

Include what you found, how to reproduce it, and what an attacker could achieve.

I maintain this project alongside other work, so I cannot promise a fixed
response window. I will acknowledge your report and tell you honestly whether
and when I can act on it.

## Supported versions

This project has no maintained release branches. Fixes land on `main`.

## Dependencies

Dependency updates arrive through Dependabot. If you find a vulnerable
dependency, an ordinary pull request bumping it is welcome and does not need
private disclosure.
