# Tasks — Improve port tooling

## 1. CI backstop
- [x] 1.1 Add `.github/workflows/ci.yml`: trigger on push to `main` (trunk-based,
  no PR flow — a `pull_request` trigger is a later add); ubuntu-latest;
  checkout → setup-node (with npm cache) → apt install `halibut jq cmake` →
  `setup-emsdk` (pin emscripten 5.0.7 to match the Brewfile) → `npm ci` →
  `npm run build:wasm` → `npm run gate`.
- [x] 1.2 Concurrency: cancel in-progress runs on the same ref. Reasonable timeout.
- [x] 1.3 Document in the workflow that the whole gate needs the generated WASM
  assets (so the emsdk/build:wasm steps are not optional), and that the emsdk
  version may need bumping if the Brewfile's emscripten moves.
- [x] 1.4 Validate YAML locally (parse-check). NOTE: end-to-end CI can only be
  verified by a real push-to-main run — flag as needing a first-run shakedown.

## 2. Focused differential helper
- [x] 2.1 Add `src/native/engine/testing/differential.ts` —
  `describeDescDifferential({ title, fixtures, params, newDesc, label?, extra? })`
  that, for each fixture, asserts `newDesc(params(f), randomNew(f.seed)).desc ===
  f.desc` (the byte-for-byte shape), running `extra?(f, params(f))` for an optional
  follow-on assertion (e.g. `validateDesc`). Keep it small — do NOT model the
  solver-agreement shape (game-specific).
- [x] 2.2 Add `differential.test.ts` for the helper (a tiny fake fixture set +
  fake `newDesc` proving pass on match / fail on mismatch / `extra` runs).
- [x] 2.3 Refactor the clean byte-match consumers onto the helper:
  `samegame`, `unruly` (1st assertion only — keep its solver block inline),
  `flood`, `guess`. Leave `galaxies` (solver-agreement only) and `flip`
  (crosses/random branch) as they are — the helper doesn't fit them cleanly.
- [x] 2.4 Each refactored game's differential test stays green.

## 3. Delete vestigial advisory diff scripts
- [x] 3.1 Delete `scripts/diff-{flip,galaxies,unruly}.test.ts` — their `.c` AND
  `*-trace.c` are deleted, so they can only skip or re-read the gated fixture
  (no signal).
- [x] 3.2 `package.json` `diff` script gains `--passWithNoTests` so `npm run diff`
  no-ops gracefully when no in-flight port has an advisory diff. Keep
  `scripts/diff.vitest.config.mts`.
- [x] 3.3 Playbook §4: make the advisory-diff lifecycle explicit — a
  `scripts/diff-<game>.test.ts` shells the live C trace binary and is **dev-time
  only**, created during a port and DELETED with the game's `.c` at acceptance
  (so it never lingers as a no-signal fixture re-reader). The committed durable
  form is the gated frozen-snapshot `*-differential.test.ts`.

## 4. Enrich the scaffolder
- [x] 4.1 `scripts/new-game-port.sh` also emits a starter
  `src/native/games/<id>/<id>.test.ts`: a serialise/deserialise round-trip skeleton
  + a `renderScenario` smoke skeleton (imports from `../../engine/testing/`),
  with TODO markers.
- [x] 4.2 Emit a commented `<id>-differential.test.ts` stub referencing
  `describeDescDifferential` + the fixture-regenerate recipe, left commented so a
  fresh scaffold still type-checks (uncomment once the fixture exists).
- [x] 4.3 Regenerate a throwaway scaffold, confirm the emitted test file
  type-checks + lints clean, then remove the throwaway.

## 5. Validation
- [x] 5.1 `npm run gate` green (tsc → lint → test:run → vite build).
- [x] 5.2 `openspec validate improve-port-tooling --strict` passes.
- [ ] 5.3 Owner acceptance (CI needs a first push-to-main shakedown), then archive.
