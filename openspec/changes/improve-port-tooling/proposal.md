# Change: Improve port tooling — CI backstop, differential helper, richer scaffolder

## Why
Pre-port-tidy #3 lowered per-port *code* friction; this lowers per-port *risk and
test friction* before the Untangle port (#16) and the ~24 after it. Three gaps the
tidy-3 survey surfaced but left open:

1. **No CI.** The husky pre-commit hook is the *only* gate, so a `--no-verify`
   commit or a fresh clone whose `npm install` never ran `prepare` lands breakage on
   `main` undetected. For a fidelity-critical port with two dozen games to go, the
   single-point-of-failure gate is the biggest standing risk.
2. **Differential boilerplate + dead advisory scripts.** The gated
   `*-differential.test.ts` files repeat the same byte-for-byte desc assertion; and
   the three `scripts/diff-*.test.ts` are now *vestigial* — every game they cover
   (flip/galaxies/unruly) had its `.c` AND its `*-trace.c` deleted at port time, so
   they can only skip (no binary to build) or re-read the frozen fixture the gated
   test already reads (no added signal).
3. **The scaffolder stops at source stubs.** `scripts/new-game-port.sh` stamps the 5
   source files but no test scaffolding, so every port hand-creates its first test
   file from scratch.

## What Changes
- **Add CI** (`.github/workflows/ci.yml`): on push to `main` and on every PR, run
  the *same* gate the husky hook runs — `build:wasm` (Emscripten via
  `setup-emsdk`, plus apt `halibut`/`jq`/`cmake`) then `npm run gate`
  (typecheck → lint → test:run → vite build). The whole gate needs the generated
  WASM/catalog assets (`src/puzzle/{catalog,types,worker}.ts` import from
  `src/assets/puzzles/`), so a cheap no-WASM tier is not possible — CI mirrors the
  full local gate. CLAUDE.md previously deferred CI/CD "until this fork wants its
  own"; the owner has now opted in.
- **Add a focused differential helper** `src/native/engine/testing/differential.ts`
  — `describeDescDifferential({ title, fixtures, params, newDesc, label?, extra? })`
  for the *byte-for-byte desc* shape repeated across samegame/unruly/flood/guess.
  Refactor those clean consumers onto it. **Deliberately not** a universal helper:
  the solver-agreement shape (galaxies, unruly's 2nd assertion) is game-specific
  (each game's decode+solve differs) and stays inline — forcing it into the helper
  would be the leaky abstraction the tidy-3 survey warned against.
- **Delete the three vestigial `scripts/diff-*.test.ts`** (flip/galaxies/unruly) —
  their C oracle and trace harness are gone, so they carry no signal. Keep the
  consolidated `scripts/diff.vitest.config.mts` + `npm run diff` (now
  `--passWithNoTests`) for *in-flight* ports, whose advisory diff script lives only
  while the game's `.c` does. Make this lifecycle explicit in the playbook.
- **Enrich the scaffolder**: `new-game-port.sh` also emits a starter
  `<game>.test.ts` (a serialise round-trip + a render-scenario smoke skeleton) and a
  commented differential-test stub pointing at the helper, so a fresh port starts
  with test scaffolding shaped, not blank.

## Impact
- **Affected specs:** `build-pipeline` (ADDED: CI runs the full gate on push/PR);
  `repo-layout` (ADDED: shared differential-test helper; MODIFIED: the scaffolder
  requirement now also emits starter test scaffolding).
- **Affected code:** new `.github/workflows/ci.yml`;
  `src/native/engine/testing/differential.ts` (+ test); refactor
  `src/native/games/{samegame,unruly,flood,guess}/*-differential.test.ts`; delete
  `scripts/diff-{flip,galaxies,unruly}.test.ts`; `scripts/new-game-port.sh`,
  `package.json` (`diff` gains `--passWithNoTests`); `docs/porting/game-port-playbook.md`.
- **Behaviour:** no runtime change. CI cannot be fully verified without a real PR
  run (Emscripten/halibut on Ubuntu + emsdk version pinning) — flagged as needing a
  first-PR shakedown.
