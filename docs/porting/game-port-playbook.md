# Game Port Playbook

> **Provisional v1 (2026-06-16) — live wiki.** Codified from the first 14 ports
> but not yet battle-tested by *following* it on a fresh port. Port #15 validates
> it. **Update this file whenever you work on a game** (a new port, but also
> iterating an existing one) and hit something it didn't tell you, got wrong, or
> could say better — that edit is part of "done," in the same change. See
> `add-game-dev-guides`.
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
from the C build and the TS port for the same seed and eyeball the diff. The
durable forms used by past ports: a **gated** frozen-snapshot test
(`<game>-differential.test.ts` vs a `__fixtures__/*.json` recorded from C) and an
**advisory** live `scripts/diff-<game>.test.ts`. Tighten the bar (not the
comparison) per-game only when a generator's uniqueness constraints warrant it
(Galaxies' D7). See the differential sections of the Flip/Galaxies archives.

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
