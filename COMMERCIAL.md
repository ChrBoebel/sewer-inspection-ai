# Commercial use

Copyright © 2026 Christopher Böbel

This project is licensed under the **GNU AGPL-3.0** (see [`LICENSE`](LICENSE)).
That is a deliberate choice, and it has one practical consequence worth
understanding.

## What the AGPL means for you

**If you are building open source:** take it, modify it, publish it — as long as
your result is also AGPL-3.0 and its source is available. You do not need to ask
me and you owe me nothing. I would still enjoy hearing about it.

**If you want to build it into a proprietary product:** the AGPL will not work
for you. It requires you to publish the complete source of your combined work —
and that obligation applies even if you only offer the software as a network
service without ever distributing it (AGPL §13). That clause is what separates
the AGPL from the GPL.

For that case you need a **commercial license from me**.

## Requesting a commercial license

Reach me on GitHub: **[@ChrBoebel](https://github.com/ChrBoebel)** — an issue in
this repository works, or contact me directly.

Please include:

- what you are building and in what context you want to use the software,
- whether you intend to distribute it or run it as a service,
- whether you plan to modify the code.

I will get back to you with terms. For research, teaching, theses, and
non-commercial projects this is usually straightforward.

## Important: you need a second license too

A commercial license from me covers **my** part — the code in this repository.
It does **not** cover the dependencies.

Specifically: the YOLO detectors build on **Ultralytics**, and Ultralytics is
itself AGPL-3.0. For proprietary use you additionally need an **Ultralytics
Enterprise License** directly from Ultralytics. There is no way around it,
regardless of what I grant you. Details in [`THIRD_PARTY.md`](THIRD_PARTY.md).

If you would rather avoid the Ultralytics dependency: the placeholder detector
and the ONNX adapters work without it. Note that the ISWDS ONNX models carry
their own restriction (Fair Non-Commercial Research License) — that is covered
in `THIRD_PARTY.md` as well.

## Why not simply "use only on request"?

Because that would not be legally possible. The code depends on Ultralytics and
is therefore a derivative work under AGPL-3.0 — that license obliges me to grant
everyone the same rights. I cannot narrow them after the fact. Combining AGPL
for everyone with a commercial license on request is the clean way to achieve
both: open use stays open, commercial exploitation goes through me.
