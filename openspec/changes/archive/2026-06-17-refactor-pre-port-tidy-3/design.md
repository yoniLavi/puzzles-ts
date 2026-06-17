# Design — Pre-port tidy #3

## What earns promotion, and what deliberately does not

The survey applied one bar: **promote only same-code-modulo-names duplication**
(the second-consumer rule), and reject *superficial* similarity where the
surrounding logic genuinely varies — because a helper that needs N flags to cover
its callers is worse than the lines it replaces, and a helper that hides per-game
knowledge is a latent corruption bug.

### Promoted

- **Modifier-mask constants** — `0x7800` and friends are byte-identical magic
  numbers in 10 games. Zero judgement to extract; they belong next to the button
  constants already in `pointer.ts`. A `stripModifiers(button)` convenience covers
  the universal `button & ~MOD_MASK` site.

- **`parseDimensions(s, start) → { w, h, next }`** — values-returning, not
  `p`-mutating. The mutate-the-params shape can't be shared because field names
  diverge (`w/h`, `width/height`, `d1/d2`, `w2/h2`); returning `{ w, h, next }`
  and letting each caller assign into its own typed params is the shape all three
  current idioms reduce to. `next` (index past the consumed dims) lets callers
  that carry a trailing suffix (`m<movetarget>`, difficulty letter) continue
  parsing. Cube becomes a bonus consumer after eating its leading solid letter.
  No matching `encodeWxH` — encode is a one-line template everywhere and a helper
  nets ~0.

- **`gridCursorMove` — position-only.** This is the one with a real design
  constraint. Two games already reinvented it locally, which is the strongest
  promote signal; but it must return *new coordinates or null* and never touch
  `ui`. A `ui`-owning variant would have to absorb: which field holds the cursor,
  whether the game tracks a `changed` flag, the "first arrow-press only reveals
  the cursor" idiom, and the null-vs-`UI_UPDATE` return policy — all of which vary
  per game. Position-only keeps the helper a pure clamp (with an optional `wrap`
  for toroidal games like Sixteen) and leaves the policy where it belongs. Games
  with non-positional cursors (cube's rolling direction, pegs' obstacle-skip
  jump-cursor, range's paint-while-traversing) simply don't consume it.

  **Reconciling with the existing `cursorDelta` decision.** The `ts-engine` spec
  already has a "shared cursor button-to-delta helper" requirement that
  deliberately drew the share line at the *button→delta mapping only* —
  "per-game cursor clamping … SHALL remain local." That decision predates the
  observation that two games went on to independently reinvent the *whole* clamp.
  This change revisits it with that new evidence: `cursorDelta` stays for the
  custom-traversal games, and `gridCursorMove` is added (built on `cursorDelta`)
  for the common bounded/toroidal clamp — so the requirement is **MODIFIED**, not
  contradicted. The share line moves from "delta only" to "delta for custom cases,
  delta+clamp for the common positional grid," which is exactly the boundary the
  reinventions revealed.

### Rejected (kept local on purpose)

- **`redrawTiles` per-tile cache HOF** — the shared part is a ~6-line
  `for…{ if (cache[i] !== key) { draw(); cache[i] = key } }` skeleton plus a
  2-line bg fill. The substance (key packing, the draw call, grid shape, flash
  timing, animation forcing, overlay diffing) is legitimately per-game, and the
  most interesting renderers (galaxies' 4-array sidecar, twiddle/sixteen/fifteen's
  animation-forced redraws, sixteen's out-of-loop overlay diff) don't fit a
  single-`number`-key signature. A HOF would add a module + two closures per site
  to save a `for` header and an `if` — negative ROI. The CLAUDE.md "queued" note
  already scopes this correctly as a *documented convention to follow*, not a
  helper to build. Re-evaluate only if a second game needs the galaxies multi-array
  variant.

- **`colours()` palette helper** — the reusable math (`mkhighlight*`) is already
  extracted and consumed in one line. What remains is irreducibly per-game: no two
  games share a `COL_*` index layout, and the cursor RGB is a per-game design
  choice (blackbox `[1,0,0]`, pegs `[0.5,0.5,1]`, unruly `[0,0.7,0]`, galaxies'
  bg-tinted cursor). A parameterised `standardGridPalette()` would be *longer* at
  the call site than the current destructure + explicit slot assignment.

- **`cloneState` / `executeMove` skeleton** — highest coupling risk. Each clone is
  bespoke because what it *doesn't* copy encodes per-game invariants: palisade
  shares `clues` by reference, unruly shares the `immutable` clue mask, cube shares
  its grid arena. A generic "clone all typed arrays + spread" helper would silently
  alias these into history siblings — a corruption bug, not a refactor. The
  `{x,y}` Move-shape commonality is superficial; every payload differs.

- **`presets()` / `validateParams()`** — per-game *data* and per-game bounds with
  per-game error strings; only superficial rhyme. The one micro-candidate (the
  area-overflow guard string, exact in 7 games) uses a *different* limit per game,
  so a helper hides the limit while saving ~7 lines — below the indirection bar,
  and these are faithful ports reviewers cross-check against C line-by-line.

## Tooling decisions

- **Single advisory diff config.** Each `scripts/diff-*.test.ts` already self-guards
  (`existsSync(FIXTURE)` / try the binary, skip otherwise), so one config globbing
  them all is safe; isolation is still available via `vitest -t <name>`. This is
  pure de-duplication with no behaviour change.

- **build-emcc cache guard.** The cmake `option()` honours a previously-cached
  value, so flipping `USE_TS_LEAVES`/`USE_TS_<MODULE>` against a stale
  `build/wasm/CMakeCache.txt` silently builds the wrong configuration. The script
  SHALL detect a flag/cache mismatch and reconfigure clean (or fail loudly). The
  minimal, robust implementation: when an explicit leaf flag is passed, compare it
  to the cached value and `rm -rf` the build dir on mismatch before configuring.

- **Scaffolding scope.** `new-game-port.sh` stamps the *mechanical* skeleton (dir,
  typed `Game<…>` stubs, empty `__fixtures__/`) and prints — but does not perform —
  the edits that require judgement (the trace.c, the two registration edits). It
  is a time-saver and a checklist, not a code generator that writes logic.

- **Sixteen differential.** Preferred resolution: write the byte-match test against
  a regenerated reference (Sixteen has a real generator path, so a byte-match earns
  its keep more than Cube's). If regenerating the C reference proves disproportionate
  (its trace harness was never committed — would need rewriting), fall back to an
  explicit re-deferral with the Cube/Fifteen rationale recorded in its tasks/spec.
  The point is to close the *dropped-task* gap, not to mandate a differential.
