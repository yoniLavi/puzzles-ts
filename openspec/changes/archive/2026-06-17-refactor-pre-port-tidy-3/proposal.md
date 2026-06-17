# Change: Pre-port tidy #3 — promote input/params helpers, consolidate diff tooling, add port scaffolding

## Why
Fifteen games are now ported and the next port (#16) is about to start. A
cross-game survey (four parallel audits: render/cache, `index.ts` boilerplate,
differential harness, build/dev tooling) found a fresh layer of verbatim
duplication and tooling friction that the second-consumer rule says to promote
now — the same reasoning that motivated `refactor-pre-port-tidy` before port #5
and `refactor-pre-port-tidy-2` before port #13. The cheapest moment to fix it is
before port #16 copies the wrong patterns forward.

This change is scoped to the high-ROI, low-risk consolidations the survey
surfaced as genuinely *same-code-modulo-names* (not superficially similar), plus
the cheap tooling wins that compound across the ~25 remaining ports. Two of the
code extractions fix latent bugs in passing.

Deliberately **out of scope** (survey-confirmed non-starters; see `design.md`):
a `redrawTiles` per-tile cache helper (the duplication is a 6-line loop *shape*,
not logic, and galaxies/twiddle/sixteen don't fit a single-key helper), a
`colours()` palette helper (no two games share a `COL_*` layout or cursor RGB),
and a `cloneState`/`executeMove` skeleton (what each game does *not* clone
encodes per-game knowledge — a generic helper would silently alias shared clue
arrays into history siblings). Also out of scope and flagged to the owner
separately: standing up CI (CLAUDE.md defers CI/CD by policy).

## What Changes
- **Promote keyboard modifier-mask constants** to `src/native/engine/pointer.ts`
  (which already exports the button constants for exactly this reason). Ten games
  redeclare `const MOD_MASK = 0x7800` locally; several also redeclare
  `MOD_NUM_KEYPAD = 0x4000`, `MOD_SHFT = 0x2000`, `MOD_CTRL = 0x1000`. Export the
  four constants plus a `stripModifiers(button)` helper; each game imports instead
  of redeclaring the magic number.
- **Promote `parseDimensions(s, start) → { w, h, next }`** to
  `src/native/engine/params.ts`. The leading-`WxH`-with-square-fallback codec
  exists in three competing idioms (`parseLeadingInt` blocks, hand-rolled
  `isDigit` loops, `indexOf("x")`+slice) across ~12 games. A values-returning
  helper (not `p`-mutating — field names diverge: `w/h`, `width/height`, `d1/d2`)
  converges all three. **Fixes a latent bug**: `sixteen` and `pegs` assume the
  `x` is present (`s.indexOf("x")` returns `-1` on a bare `"4"`), so they
  mis-slice a square-form param; routing them through the helper restores the
  square fallback.
- **Promote `gridCursorMove(button, x, y, w, h, wrap?) → { x, y } | null`** and
  `isCursorMove(button)` to `src/native/engine/pointer.ts`. Fifteen and Sixteen
  have *already independently reinvented* this exact position-only cursor-clamp
  helper locally (`moveCursorClamped`, `moveCursor`); ~9 more games inline the
  same 4-line clamp. The helper is **position-only** by design (returns new coords
  or `null`) — it never owns `ui`, because the surrounding "first-press just shows
  cursor", `changed`-tracking, and null-vs-`UI_UPDATE` policy genuinely vary per
  game. Deletes the two local reinventions; converges ~11 hand-rolled clamps.
- **Consolidate the advisory differential tooling.** Replace the three
  near-identical `scripts/diff-{flip,galaxies,unruly}.vitest.config.mts` (they
  differ only in the `include` filename) with one
  `scripts/diff.vitest.config.mts` globbing `scripts/diff-*.test.ts` (each diff
  test already self-guards when its fixture/binary is absent), and add an
  `npm run diff` script. Stops the config count growing one-per-port.
- **Guard the `build-emcc.sh` cmake stale-cache footgun.** When the leaf flags
  (`USE_TS_LEAVES`/`USE_TS_<MODULE>`) differ from the cached cmake configuration,
  the script SHALL reconfigure from clean (or warn loudly) instead of silently
  honouring the stale cached `option()` value. Today this footgun is documented
  only in CLAUDE.md, not in the script a contributor actually reads.
- **Add new-game-port scaffolding.** A `scripts/new-game-port.sh <gameId>` that
  stamps out `src/native/games/<id>/` with typed `Game<…>` stubs and an empty
  `__fixtures__/`, and prints the manual-edit checklist (the `<id>-trace.c`, the
  `ts-ported-ids.ts` + `games/index.ts` registration). Referenced from the
  game-port playbook as the copy-from-exemplar entry point.
- **Cheap tooling hygiene.** Remove the dead `lint-staged` block from
  `package.json` (configured but never invoked — the hook runs whole-repo
  `npm run lint`, so the block misleadingly implies staged autofix that never
  runs); add `typecheck` and `gate` npm scripts mirroring the pre-commit gate so
  contributors can run the exact gate locally; rename `package.json` `"name"`
  from the inherited `"puzzles-web"` to this fork.
- **Fix the Sixteen differential drift.** `add-sixteen-ts-port`'s `tasks.md`
  scheduled a `sixteen-differential.test.ts` as a non-optional task that was
  silently never written. Either add it (byte-match against a regenerated C
  reference) or explicitly re-defer it per the Cube/Fifteen precedent and tick the
  box — not leave a dropped task.
- **De-drift the playbook's differential section.** §4 presents "gated test **and**
  advisory script" as the standard pair, but the differential is per-game optional
  (6/15 gated, 3/15 scripted, by intentional decision); and the regenerate-recipe
  flags disagree across fixture headers (`-DUSE_TS_RANDOM=0` vs `-DUSE_TS_LEAVES=0`
  vs both). Settle on one canonical command and correct the "recover from git
  history" note (flip/flood/guess trace.c were never committed).

## Impact
- **Affected specs:**
  - `ts-engine` — ADDED: modifier-mask constants + `stripModifiers`,
    `parseDimensions`, `gridCursorMove`/`isCursorMove` shared helpers.
  - `build-pipeline` — ADDED: advisory differential check uses a single shared
    config; `build:wasm` guards against stale leaf-flag cmake cache.
  - `repo-layout` — ADDED: new-game-port scaffolding script under `scripts/`.
- **Affected code:**
  - `src/native/engine/pointer.ts` (+ constants, `stripModifiers`,
    `gridCursorMove`, `isCursorMove`; + `pointer.test.ts`),
    `src/native/engine/params.ts` (+ `parseDimensions`; + `params.test.ts`).
  - The ~12 games consuming the above (drop local `MOD_MASK`/clamp/parse copies).
  - New `scripts/diff.vitest.config.mts`; delete the three per-game ones.
  - `scripts/build-emcc.sh` (cache guard), `scripts/new-game-port.sh` (new).
  - `package.json` (scripts, name, lint-staged removal).
  - `src/native/games/sixteen/sixteen-differential.test.ts` (+ fixture) or its
    task re-deferral; `docs/porting/game-port-playbook.md` §1/§4.
- **Behaviour:** no visible runtime change intended. The parse-helper migration
  *fixes* sixteen/pegs square-form decode (latent, since their own encoders always
  emit the `x`); every other migration is same-output. The dev-experience and
  tooling changes affect contributor workflow only.
