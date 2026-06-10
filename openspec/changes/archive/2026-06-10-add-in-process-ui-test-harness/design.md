## Context

`vitest.config.ts` sets `environment: "node"`. The game/engine suites
need nothing more and run fast there. What can't run there: anything
touching `document`/`customElements` (Lit) or `indexedDB` (Dexie). The
recording-`GameDrawing` double already lets rendering *ops* be asserted
in `node` (see `midend.test.ts`), so this change is specifically about
the DOM + IndexedDB layers.

## Goals / Non-Goals

- Goals: component tests (mount a Lit element, drive a command, assert
  behaviour) and persistence tests (Dexie round-trips) running under
  `vitest`, no browser; keep the fast `node` default for logic suites;
  document the testing tiers so the next contributor reaches for the
  in-process tool first.
- Non-Goals: replacing Playwright entirely (visual "does it look right"
  and full worker+canvas+IndexedDB integration stay a smoke-check);
  testing Web Awesome's internals; pixel-level canvas assertions
  (the recording double covers draw-op intent, not rasterisation).

## Decisions

- **`happy-dom`, not `jsdom`.** Faster and lighter for component unit
  tests; Lit + `customElements` work under it. dev-only, so its browser
  fidelity ceiling is acceptable (visual fidelity is Playwright's job).
- **Per-file environment opt-in.** Keep `environment: "node"` global;
  component/persistence files declare `// @vitest-environment happy-dom`.
  The ~600 fast logic tests don't pay DOM setup cost.
- **`fake-indexeddb/auto` via a setup module** imported by persistence
  tests, so `db` (Dexie) opens against an in-memory IndexedDB. Each test
  resets the database to isolate.
- **Fake `Puzzle` for component tests.** `puzzle-screen` talks to a
  `Puzzle` (Comlink-backed). Component tests inject a hand fake exposing
  `canFindMistakes`/`findMistakes()`/`saveGame()`/… so the command logic
  (mistake count → save vs. block, label adaptation) is asserted without
  a worker. This is the seam that would have caught the wall bug's
  *symptom* path (save-when-it-should-not) at unit level.
- **Recording `GameDrawing` is tier 2, promote it.** Document that new
  render code should ship a draw-op test (e.g. "a `COL_MISTAKE` rect is
  emitted for a flagged cell") rather than relying on a human eyeballing
  Playwright — that is how the wall-mistake render will be tested.

## Risks / Trade-offs

- Web Awesome components under happy-dom may not fully upgrade; tests
  target *our* component logic and command dispatch, not WA rendering.
  Where a WA element is in the way, query by `data-command` / assert the
  handler, not the rendered shadow DOM.
- Two environments slightly complicate the config; mitigated by the
  per-file annotation pattern (standard vitest).

## Open Questions

- Whether to add a thin worker-boundary integration test (TsWorkerPuzzle
  ↔ midend) in `node` — cheap and worth it, but can follow.
