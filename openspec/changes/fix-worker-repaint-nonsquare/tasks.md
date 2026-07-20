# Tasks — fix-worker-repaint-nonsquare

> **PARKED 2026-07-21 (owner decision): not reproducible.** A full diagnosis
> pass (see `FINDINGS.md`) could not reproduce the blank non-square board in any
> Chromium configuration — headless-visible, headed (real compositor + CSS
> transition), or under a forced second resize — for Loopy *or* Pearl, and the
> worker's offscreen bitmap was **fully painted every time**. The change's core
> hypothesis ("a repaint is dropped on a `w ≠ h` path") is contradicted, not
> confirmed, so **no §2 code was written**. The task told us to confirm or
> replace the hypothesis from the trace before coding; it was replaced. Resume
> only with a real repro (WebKit/Firefox untested; owner's own browser
> untested) — see `FINDINGS.md` "How to resume".

## 1. Reproduce and diagnose (the mechanism is not yet known)

- [x] 1.1 Reproduce with the app running — **DONE, could not reproduce.**
      `/loopy?type=5x4t9dh` and `/pearl?type=12x8dt` paint correctly on first
      load in visible Chromium (headless + headed). The MCP "claude-in-chrome"
      tool shows a false blank because its tab is permanently `hidden` (see
      `FINDINGS.md`); it is unusable for this bug.
- [x] 1.2 Instrument the sequence — **DONE.** Traced `attachCanvas → setDrawingPalette
      → size → resizeDrawing → redraw` on the main thread and read the worker
      offscreen bitmap. Square and non-square traces are identical in shape and
      both end on a `redraw`. Instrumentation reverted (tree clean).
- [x] 1.3 Identify which repaint is dropped — **DONE: none is dropped.** The
      offscreen canvas is fully painted in every case; there is no damaging
      second resize (a post-load resize is a no-op or is `resizeDrawing` **then**
      `redraw`). Hypothesis replaced: the only plausible remaining mechanism is a
      Safari/Firefox onscreen-mirror gap, which is a *different* fix from §2.

## 2. Fix at the adapter/midend seam — NOT DONE (no fix warranted)

- [ ] 2.1 ~~Apply the fix the diagnosis points to~~ — the diagnosis points to
      *no* dropped engine repaint, so there is nothing to fix at this seam.
      Blocked pending a real repro with a known mechanism.
- [ ] 2.2 (moot) — no framework pixels were added because no fix was made.
- [x] 2.3 The earlier first-palette-install fix still stands (verified present
      and firing: `setDrawingPalette` first-install `forceRedraw` runs in every
      trace) and was not duplicated.

## 3. Regression test — NOT DONE

- [ ] 3.1 No test written: there is no reproducing interleaving to assert
      against. Writing a green test around a non-bug would be false assurance.
      (If resumed as an onscreen-mirror fix, the test belongs around "first frame
      reaches the screen," not the adapter seam.)

## 4. Spec + close out

- [ ] 4.1 The `ts-engine` first-frame-repaint spec delta is **not** applied —
      it is left in the change dir, unarchived, pending a real repro. As written
      it asserts "the first frame is painted," which the evidence shows already
      holds; if resumed it likely needs reframing to "reaches the screen."
- [x] 4.2 Dev-verify — **DONE:** deep links paint on first load across square and
      non-square tilings (Loopy) and Pearl. Nothing was blank in a visible
      browser.
- [ ] 4.3 (deferred) `openspec validate` — the change stays valid but unarchived.
- [ ] 4.4 ~~Archive, then commit~~ — parked, not archived. `FINDINGS.md` records
      the full evidence for whoever resumes.
