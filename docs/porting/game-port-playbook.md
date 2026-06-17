# Game Port Playbook

> **Provisional v1 (2026-06-16) — live wiki.** Codified from the first 14 ports
> and first battle-tested by *following* it on port #15 (Unruly, 2026-06-17),
> which surfaced and fixed the gaps now folded in below (the differential
> pure-C build flag, the `mkhighlightSpecific` palette helper, the
> index-mirroring palette gotcha). **Update this file whenever you work on a
> game** (a new port, but also iterating an existing one) and hit something it
> didn't tell you, got wrong, or could say better — that edit is part of
> "done," in the same change. See `add-game-dev-guides`.
>
> **This guide is the *how*. The *what* lives in the specs — links below are
> authoritative; this file paraphrases for flow and must not be trusted over
> them.** Anti-drift rule: state a normative rule briefly + link it; point at an
> exemplar file rather than pasting code that rots.

Authoritative specs: [`ts-migration`](../../openspec/specs/ts-migration/spec.md)
(strategy, parity gate, C deletion, test discipline) ·
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) (the `Game` interface, the
`Midend`) · [`repo-layout`](../../openspec/specs/repo-layout/spec.md) (where
things live, in-process test tiers). Strategic narrative:
[`AGENTS.md`](../../AGENTS.md). **Exemplar port to read end-to-end before
starting:** [`src/native/games/galaxies/`](../../src/native/games/galaxies/)
(idiomatic, six-file split, ~3000 lines vs ~4500 in C).

---

## 0. Pre-flight: pick the next game and check the long-tail risks *first*

Order is **simplest-first, then the games we want to enhance** (see the
migration order in [`AGENTS.md`](../../AGENTS.md) and
[`ts-migration`](../../openspec/specs/ts-migration/spec.md)). Before committing
to a game, read its `puzzles/<game>.c` enough to check it against the
**long-tail-risk checklist** — these are upstream mechanisms the fork has been
dodging that need an interface decision *before* you start, not mid-port (full
list under "Long-tail migration risks" in [`AGENTS.md`](../../AGENTS.md)):

- **`midend_supersede_game_desc`** — Mines (first-click-not-a-mine), Net
  (centre-on-click), Untangle (drag-then-share). Needs a `Game`-interface hook
  before one of these is ported.
- **Undo via state-string equality** — games that detect "did anything change?"
  by stringifying state (Net's rotation cycles is the hard case). Galaxies
  returns `null` from `interpretMove` instead; fine when locally decidable.
- **`#ifdef EDITOR` move letters** — don't map editor-only input letters; say so
  in the port's `design.md`.
- **`printing.c`** — deleted at fork; any "print this puzzle" need has no TS
  replacement yet.

If the game trips one of these, the port's `design.md` must decide the approach
(or the game waits for the enabling change). Open the port as **one openspec
change** (`add-<game>-ts-port`) — proposal + tasks + design + per-game spec
deltas. See the [openspec proposal workflow](../../openspec/OPENSPEC_AGENTS.md).

---

## 1. File layout

**Start with the scaffolder:** `scripts/new-game-port.sh <puzzleId>` stamps out
`src/native/games/<puzzleId>/` with compiling typed `Game<…>` stubs in the file
shape below (throwing where logic goes) and an empty `__fixtures__/`, then prints
the manual-edit checklist it deliberately won't do for you (the C trace harness,
the two registration edits, the icon PNGs). Fill the stubs against the C
reference; read [`galaxies/`](../../src/native/games/galaxies/) end-to-end as the
exemplar.

A ported game lives in `src/native/games/<puzzleId>/`. The shape that has held
across ports (Galaxies is the reference; small games may collapse files):

| File | Holds |
| --- | --- |
| `index.ts` | The `Game<…>` object + glue: move logic, `interpretMove`/`executeMove`, presets, `colours()`, `setTileSize`, optional `hint`/`findMistakes`, `registerGame(...)`. |
| `state.ts` | Immutable state type + params, encode/decode/validate desc + params, `newState`, `cloneState`, the move/UI types. |
| `solver.ts` | The deductive solver (used by the generator for uniqueness, by `solve`, and — if added — by `hint`/`findMistakes`). |
| `generator.ts` | `newDesc`: board generation + retry-to-target-difficulty. |
| `render.ts` | `redraw`, the palette, `computeSize`, the per-tile cache. |

Leaf libs (dsf, sorted structures) are pulled in **idiomatically and lazily**:
use the shared [`src/native/engine/`](../../src/native/engine/) helpers
([`dsf.ts`](../../src/native/engine/dsf.ts),
[`sorted-multiset.ts`](../../src/native/engine/sorted-multiset.ts),
[`colour-mkhighlight.ts`](../../src/native/engine/colour-mkhighlight.ts),
[`pointer.ts`](../../src/native/engine/pointer.ts),
[`params.ts`](../../src/native/engine/params.ts)). If a second consumer of a
game-local helper appears, promote it to `engine/`.

Reach for these in `interpretMove`/`decodeParams` instead of re-rolling the
idiom (every game grew its own copy until they were consolidated):
- [`stripModifiers(button)`](../../src/native/engine/pointer.ts) for
  `button & ~MOD_MASK` (and `MOD_CTRL`/`MOD_SHFT`/`MOD_NUM_KEYPAD` for the bits
  themselves) — don't redeclare `const MOD_MASK = 0x7800`.
- [`gridCursorMove(button, x, y, w, h, wrap?)`](../../src/native/engine/pointer.ts)
  for the bounded (or toroidal) cursor clamp — it returns `null` on a non-cursor
  button **and** on a clamped-edge no-op, so `?? { x, y }` reproduces the
  "always returns a position" shape, while the per-game policy (which field
  holds the cursor, "first arrow reveals it", `UI_UPDATE` vs `null`) stays local.
  Pair with [`isCursorMove(button)`](../../src/native/engine/pointer.ts) for the
  `button >= CURSOR_UP && button <= CURSOR_RIGHT` range check. A non-trivial
  traversal (half-grid cursor, corner-skipping, lock modes) keeps its own logic.
- [`parseDimensions(s, start?)`](../../src/native/engine/params.ts) for a leading
  `WxH`-or-square dimension prefix (`next` continues a trailing suffix). It
  restores the square fallback that `s.indexOf("x")` silently mis-sliced on a
  bare `"4"`. Not for non-`WxH` formats (e.g. Blackbox's `w<W>h<H>m…M…`).

**Pointer coordinates can be fractional.** Most ports convert a pixel to a cell
index via [`fromCoord`](../../src/native/engine/geometry.ts) (a `Math.floor`), so
this never bites. But a game that stores *pixel-space* coordinates in its state —
Untangle keeps rational vertex positions — must **round pointer input to integers
at the boundary** (`devicePixelRatio` scaling delivers sub-pixel coords where
upstream's GUI frontend hands `interpret_move` integers). Untangle's
exact-integer crossing test threw a `BigInt` `RangeError` on the first in-window
fractional drop; the fix rounds in `placeDraggedPoint` and re-checks the integer
invariant in `executeMove` (the single drag/solve/replay/load chokepoint) so a
bypass fails loudly. Exemplar: [`untangle/index.ts`](../../src/native/games/untangle/index.ts).

## 2. Idiomatic TS, not a C transliteration

Use the C as a **reference for the logic** (what the solver deduces, how the
generator ensures uniqueness), not a control-flow template. The bar and the
rationale are the "TS port style" section of [`AGENTS.md`](../../AGENTS.md):
classes over handle-passing, `[Symbol.iterator]()` over `while (next())`,
`boolean`/discriminated unions over `0|1` sentinels, GC over `dup`/`free`,
modern data structures over C-array mirrors. There is no corpus a refactor can
break, so write it clean the first time.

**Render cache key:** pack flags into an `Int32Array`, *not* `BigInt64Array`
(`BigInt` is hot-path-expensive and idiomatically wrong here). Exemplar:
[`galaxies/render.ts`](../../src/native/games/galaxies/render.ts) and
[`range/render.ts`](../../src/native/games/range/render.ts). When the key bits
run out, add a parallel sidecar typed-array checked in the cache-miss branch
(Galaxies' `wrongEdges`), don't widen to `BigInt`.

**Rendering doctrine (hard-won — see the Flip three-iteration story in
[`AGENTS.md`](../../AGENTS.md)):** the engine paints **no pixels of its own**;
each game fills its own background in the `!ds.started` branch. `Midend.size` is
side-effect-free; `canvasCleared()` is the *only* cache-stale signal.

**Palette: mirror the C colour-enum indices when the game has dark-mode
overrides.** `src/puzzle/augmentation.ts` may carry a `paletteOverrides` map for
a game keyed by **colour index** (Unruly's `{3..8: false}` preserves its
black/white tiles + bevels under dark mode). A TS port whose palette reindexes
the colours silently mis-targets those overrides. Keep the `colours()` array
index-for-index with the upstream `enum` (Unruly: `0 BACKGROUND, 1 GRID,
2 EMPTY, 3 COL_0…5, 6 COL_1…8, 9 CURSOR, 10 ERROR`). Exemplar:
[`unruly/render.ts`](../../src/native/games/unruly/render.ts).

**Highlight/lowlight from a fixed base, not the background:** the existing
[`mkhighlight(bg)`](../../src/native/engine/colour-mkhighlight.ts) derives its
trio from the *frontend background* and never extrapolates the base. A game that
calls upstream `game_mkhighlight_specific` on a **fixed** base colour (Unruly's
near-white `COL_0` = 0.95 grey, dark `COL_1` = 0.2 grey) needs
**`mkhighlightSpecific(base)`** instead — it extrapolates the base toward the
opposite extreme when the base sits within `K` of white/black, exactly as the C.
Reach for it whenever a tile colour isn't the host background.

**Make determined state legible (deliberate divergence).** Where upstream leaves
known cells looking like undecided ones (Range painted every non-black cell the
same grey, with only a dot marking "white"), give each determined state its own
fill so the player reads the board at a glance — Range now paints a known-white
cell (a clue or a white mark) pure white via a dedicated `COL_WHITEBG`, leaving
only undecided cells grey. Derive the white from
[`colour-mkhighlight.ts`](../../src/native/engine/colour-mkhighlight.ts): it
shifts `COL_BACKGROUND` off pure white precisely so a pure-white cell stays
distinguishable. Exemplar: [`range/render.ts`](../../src/native/games/range/render.ts).

**A solvable game must ship `findMistakes` — Check & Save depends on it.** The
shell's Check & Save control (`quick-save-actions.ts`) hard-blocks a save **only
when `canFindMistakes` is true**, which is exactly `game.findMistakes !==
undefined` (`midend.ts`). A game with a unique solution but no `findMistakes`
therefore reports `canFindMistakes` false: the control silently degrades to a
plain "Quick-save" and **saves a wrong board without complaint** (this shipped in
Unruly's first cut and was caught on owner smoke-test). So for any game with a
unique solution, `findMistakes(state)` is part of "done": re-solve from the fixed
clues to the unique solution and return every player cell that contradicts it
(`[]` when the board isn't uniquely deducible). Render the flagged cells with a
distinct overlay (a packed cache bit + an inset error outline; exemplar
[`unruly/render.ts`](../../src/native/games/unruly/render.ts) /
[`unruly/solver.ts`](../../src/native/games/unruly/solver.ts)
`findMistakes`). The hook + refusal coupling are detailed in
[hint-authoring.md](./hint-authoring.md); a permutation puzzle with no notion of
a wrong-but-legal state correctly omits it.

**Per-game preferences go through the `Game.prefs` hook (since Untangle).** A game
with upstream `get_prefs`/`set_prefs` declares an optional `prefs: GamePref<Ui>[]`
— each item is `{ kw, name, type: "boolean" }` or
`{ kw, name, type: "choices", choices }` plus `get(ui)`/`set(ui, v)` accessors.
**Preferences live on the `Ui`** (upstream stores them on `game_ui`, and the
game's `interpretMove`/`redraw` read them off the ui), so `newUi` sets the
**defaults** — that is the place to ship a deliberate divergence (Untangle's
crossed-edge highlight defaults ON). The midend builds the app's existing
preferences dialog from these, persists per-puzzle in IndexedDB, and re-applies a
player's choices after each `newUi`; the app shell needs **no change**. A
`choices` value is the **zero-based index** (the form emits `Number.parseInt`), a
`boolean` value a real boolean. Exemplar:
[`untangle/index.ts`](../../src/native/games/untangle/index.ts) (`prefs`) — and
[`untangle/state.ts`](../../src/native/games/untangle/state.ts) for the ui fields.
**Gotcha (cost a dev-verify cycle):** a pref that changes only rendering moves none
of the keys a game's `redraw` early-out watches (positions/bg/cursor), so the
midend drops the drawstate on `setPreferences` to force a full repaint — your
game's `redraw` doesn't need to do anything special, but don't be surprised the
repaint is full.

**A `solve()` that needs the generator's `aux` only works on a freshly generated
game.** The midend retains the `aux` from `newDesc` and passes it to
`solve(orig, curr, aux)` — but only for `newGame`/`#seed` (a `:desc` id or a
loaded save has no aux, so Solve correctly reports "not known", faithful to
upstream). Most ports re-derive the solution in `solve` and ignore `aux`; reach
for `aux` only when re-derivation is impractical (Untangle stores the untangled
layout). If you take `aux`, test Solve **through a real `Midend`** (not just the
game's `solve` directly), since the threading lives in the midend — a direct unit
test of `solve(…, aux)` passes while the shipped Solve is a no-op.

## 3. The two-stage parity gate (do not skip, do not shortcut)

Registration is gated on **owner-accepted full behavioural parity — rendering,
animation, input — not a green suite alone.** A green suite asserting only state
transitions can pass while the game does not render (this happened with Flip).
The authoritative rule is "Per-game hybrid; C deleted per game" in
[`ts-migration`](../../openspec/specs/ts-migration/spec.md); the parity-gate
doctrine is also in [`AGENTS.md`](../../AGENTS.md). Never call a parity shortfall
"cosmetic"/"out of scope"/deferred without explicit owner approval.

Two stages (owner-confirmed default since Galaxies):

1. **Register for smoke-testing** as soon as the automated suite is green —
   add the game to [`ts-ported-ids.ts`](../../src/native/games/ts-ported-ids.ts)
   and import it in [`games/index.ts`](../../src/native/games/index.ts) so
   `registerGame(...)` runs. The empty-registry path is the C/WASM fallback; a
   registered game serves its TS impl. The owner smoke-tests the TS path in
   `npm run dev`.
2. **Flip `TS_PORTED` + delete `.c` only on owner acceptance** — add `TS_PORTED`
   to the game's `puzzle()` in [`puzzles/CMakeLists.txt`](../../puzzles/CMakeLists.txt)
   (keeps catalog/icon metadata, builds no wasm) and delete
   `puzzles/<game>.c`. Rebuild wasm and confirm the game still appears in the
   catalog with no `<game>.wasm`.

Until acceptance the game stays unregistered and runs on C — the cost of this
discipline is ~zero.

## 4. Differential check + tests

**Dev-time differential spot-check** (advisory, *not* a gate): generate N boards
from the C build and the TS port for the same seed and eyeball the diff.

**A differential is per-game optional — it earns its place on solver/codec
games, not every port.** It pays off where the generator runs a hard
uniqueness/difficulty loop or a non-obvious codec (galaxies, unruly, flood,
guess); permutation / short-RNG games (cube, fifteen, sixteen, twiddle, pegs,
blackbox) get their RNG-faithfulness transitively from `random.ts`'s own corpus
plus the existing differentials, and deliberately ship without one (state the
skip in the port's `design.md`, as those did). Of the 15 games to date, 6 carry a
committed gated test — by this per-game decision, *not* because a differential
is mandatory. (No committed advisory `scripts/diff-*.test.ts` remain: an
advisory script is dev-time-only and is deleted with the game's `.c` — see the
lifecycle below.)

The two forms have **different lifecycles** — get this right or you leave a
no-signal vestige behind:

- **Gated, committed, durable:** the frozen-snapshot test
  `src/native/games/<game>/<game>-differential.test.ts` vs a
  `__fixtures__/*.json` recorded from C. This is the form that *survives* the
  port. When its shape is the **byte-for-byte desc match** (a faithful
  generator over the bit-identical RNG — samegame/unruly/flood/guess), don't
  re-roll the `describe`/`for`/`it`/`expect` loop: call
  [`describeDescDifferential`](../../src/native/engine/testing/differential.ts)
  with your fixtures, a `params` mapper, your `newDesc`, an optional `label`,
  and an optional `extra` for a follow-on check (e.g. `validateDesc`).
  Solver-agreement (decode a C board, run the TS solver, assert the recorded
  difficulty — galaxies; unruly's 2nd assertion) is game-specific and stays
  **inline**; the helper deliberately doesn't model it.
- **Advisory, dev-time-only, deleted with the C:** a live
  `scripts/diff-<game>.test.ts` earns its keep *only* while it shells the live
  C trace binary (`build/native/auxiliary/<game>-trace`) for a true C-vs-TS
  compare. That binary is built from `puzzles/<game>.c` +
  `puzzles/auxiliary/<game>-trace.c`, **both deleted at port acceptance** (the
  per-game C-deletion doctrine). So the moment the port ships, the advisory
  script can never run live again — it can only skip (no binary) or re-read the
  frozen fixture the gated test already reads (no signal). **Delete
  `scripts/diff-<game>.test.ts` in the same commit that deletes the game's
  `.c`** — don't leave it as a vestige (flip/galaxies/unruly each left one; all
  three were removed in `improve-port-tooling`). The infrastructure stays for
  the *next* in-flight port: one `scripts/diff.vitest.config.mts` + `npm run
  diff` (now `--passWithNoTests`, so it no-ops when no advisory script exists).
  Recover a deleted script from git history if you ever rebuild the C oracle.

Exemplar end-to-end (while the C still exists):
[`unruly-trace.c`](../../puzzles/auxiliary/unruly-trace.c) →
[`unruly-differential.test.ts`](../../src/native/games/unruly/unruly-differential.test.ts).

Concretely, the C trace harness lives in `puzzles/auxiliary/<game>-trace.c`,
`#include`s `../<game>.c` to reach its `static` generator/solver (the same trick
`STANDALONE_SOLVER` uses), and prints the desc (+ recorded solver difficulty) as
JSON; add one `cliprogram(<game>-trace <game>-trace.c)` line to
[`puzzles/auxiliary/CMakeLists.txt`](../../puzzles/auxiliary/CMakeLists.txt).

**Gotcha — build the harness pure-C.** `scripts/build-native.sh` configures with
the umbrella `USE_TS_LEAVES`/`USE_TS_RANDOM` default **ON**, which swaps
`random.c` out for a SHA-only `sha.c`; any generator trace then fails to link
(`random_upto`/`random_new` undefined). Reconfigure pure-C first (the cmake cache
persists, so pass the flag explicitly):

```
cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
(cd build/native && make <game>-trace)
build/native/auxiliary/<game>-trace > src/native/games/<game>/__fixtures__/<game>-c-reference.json
```

**The strongest bar is exact byte-match, when achievable.** Because `random.ts`
is bit-identical to `random.c`, a *faithful* generator port reproduces the C
desc **exactly** for the same seed — assert `newDesc(p, randomNew(seed)).desc ===
fixture.desc` (Unruly does this across every difficulty + unique mode; the Flip
CROSSES path is the precedent). Fall back to the weaker "TS solver agrees at the
C-recorded difficulty" bar (Galaxies' D7) only when the generator legitimately
diverges (e.g. extra RNG draws). Either way it's advisory — tighten per-game,
never gate CI on C.

**Behavioural tests by tier** — reach for the lowest that fits; Playwright is
visual/integration smoke only. Tiers are codified in
[`repo-layout`](../../openspec/specs/repo-layout/spec.md):

- **Tier 1** — pure logic (`Game` impl, solver, generator, codecs), `node` env.
- **Tier 2** — render ops against a recording `GameDrawing` double, `node`.
- **Tier 2.5** — render scenarios + snapshots via
  [`src/native/engine/testing/`](../../src/native/engine/testing/)
  (`renderScenario(...)` drives a real `Midend` to a target frame; assert
  targeted ops **plus** `toMatchSnapshot`). New render code SHOULD ship one.
- **Tier 3** — components + persistence (`happy-dom`, `fake-indexeddb`).

## 5. Close out

Keep the openspec change current as you go (tasks ticked, design decisions
recorded). The pre-commit gate (`tsc -b --noEmit` → `biome lint` → `vitest run`
→ `vite build`) must be green; the prod build needs `npm run build:wasm` assets
present. On owner acceptance, do stage 2 (above) and **archive the change**
(`openspec archive add-<game>-ts-port --yes`) in the same commit as the C
deletion. See "Keep openspec changes current" in memory and the workflow in
[`OPENSPEC_AGENTS.md`](../../openspec/OPENSPEC_AGENTS.md).

If the game gets an explained hint, that is a **separate** change — see
[hint-authoring.md](./hint-authoring.md).
