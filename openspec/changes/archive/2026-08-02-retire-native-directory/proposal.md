# retire-native-directory

## Why

`src/native/` was named for a distinction that no longer exists. It meant
*native TypeScript, as opposed to the C compiled to WASM*. `retire-c-engine`
deleted the other half on 2026-08-01, so today the name partitions the tree into
"all of the code" and "the app shell", which is not what it says. The word is
already doing a second, unrelated job three directories away: `src/css/native.css`
means *native HTML elements*.

That is the visible half. The load-bearing half is a dependency edge pointing
the wrong way, and it is 182 files deep:

```
imports from src/native/** into the app layer, measured 2026-08-02:
  182 files  ../puzzle/types.ts      (163 games, 19 engine)
    4 files  ../puzzle/catalog.ts    (tests only)
    3 files  ../utils/color.ts       (tests only)
    1 file   ../puzzle/drawing.ts        } worker-adapter.ts
    1 file   ../puzzle/engine-surface.ts }
```

`src/puzzle/types.ts` is the **engine's** vocabulary — `Colour` is what a game's
`colours()` returns, `Rect`/`Point`/`Size` are the drawing API's coordinate
records — and it sits in the app layer for one reason: it used to re-export the
Emscripten-generated `emcc-runtime.d.ts`. `retire-c-engine` hand-authored the
declarations *in place*, deliberately, so that not one of its 201 importers had
to change, and its file header says exactly that. That was the right call while
the goal was proving nothing else moved. It leaves the engine importing from the
shell, and it leaves `module-layering.test.ts` unable to say so: its third rule
blocks `screens/`, `dialogs/` and `components/`, and `src/puzzle/` is the hole
those 182 imports flow through.

Two more fossils of the same era are still tracked:

- **`src/native/combi/`** — a top-level module directory, with a C
  characterization corpus and its own openspec capability, holding an 81-line
  class with **one** consumer (`games/lightup/solver.ts`). **`src/native/random/`**
  is the same shape with 255. They are sibling directories of `engine/` because
  the retired bottom-up doctrine gave every ported seam its own folder.
- The `repo-layout` spec still **requires** that shape, `bridge.ts` slot and all
  — "the bridge (if any) at `bridge.ts`" — for a wasm `--js-library` bridge
  deleted months ago. `random`'s spec still normatively requires the bridge
  itself, and carries a pre-commit-hook requirement three steps out of date that
  `build-pipeline` already owns properly.

This is the repo's own rule — *configuration for a removed toolchain SHALL be
removed with it; nothing fails, and every one of them tells the next reader the
toolchain is still here* — applied to the source tree and to the specs that
describe it.

## What Changes

Three moves, one change, because they touch the same import lines and doing them
separately means editing each twice.

1. **Invert the engine→app dependency.**
   - `src/puzzle/types.ts` → the engine, as `src/engine/types.ts`. The app
     imports the vocabulary from the engine, not the reverse.
   - `src/native/engine/worker-adapter.ts` (+ its test) → `src/puzzle/`. It is
     the Comlink-facing adapter — the *only* production module reaching upward —
     and it belongs on the app side of the seam, not inside the thing it adapts.
   - The three test-only reaches (`puzzle/catalog.ts` ×4, `utils/color.ts` ×3)
     resolve to engine-side equivalents or move with their subject.
   - **Tighten `module-layering.test.ts` from a blocklist to an invariant**: the
     engine and games import nothing under `src/` outside themselves. A rule
     naming three directories could only ever catch the violations someone
     thought of; this one cannot be routed around.

2. **Hoist the tree.** `src/native/engine/` → `src/engine/`,
   `src/native/games/` → `src/games/`, and `src/native/` ceases to exist.

3. **Fold the two leaf seams into the engine.** `src/native/random/` →
   `src/engine/random/` (255 importers), `src/native/combi/` →
   `src/engine/combi/` (one).

   `random` keeps its frozen C corpus — it still asserts bit-identical output,
   which is what keeps shared game IDs reproducible, and no property can derive
   what bit sequence a seed yields. **`combi`'s is retired**, and the asymmetry
   is the point: its corpus records the subsets of a set, which is what the
   definition requires rather than an upstream quirk, so replaying it
   demonstrated only that C and TypeScript both implement combinations. Its
   test file already carried every closed-form property exhaustively over
   `n ≤ 8` — count `C(n, r)`, strict lex order, all distinct — which strictly
   dominates a replay of five recorded pairs.

   (Scoped in during implementation. The `combi` delta had argued the case
   while this bullet still read "both keep their corpora"; the delta was right,
   and this is the correction. Retiring it turned up the thing that makes the
   rule *"is every fact this fixture asserted derivable?"* rather than *"is this
   fixture's subject derivable?"*: the corpus block was the only place `reset()`
   was ever driven, and the `combi` spec requires that scenario. It is now an
   explicit test.)

Spec work, in the same change:

- `repo-layout` — the `src/` layout requirement is rewritten for the new paths
  and **loses the `src/native/<module>/` + `bridge.ts` category entirely**; the
  layering requirement gains the no-upward-imports invariant; the scaffolding
  requirement is repointed.
- `ts-engine` — gains one requirement: the engine owns its type vocabulary, and
  nothing under it imports the app.
- `random` — the Emscripten bridge requirement is **removed** (the mechanism is
  deleted), as is the stale three-step pre-commit requirement `build-pipeline`
  already owns; the remaining requirements are repointed.
- `combi` — repointed.

Explicitly **not** in this change:

- **Any behaviour.** Every move is a rename. No game's boards change, no
  fixture is re-recorded, no render output moves a pixel.
- **Regrouping the engine's 104 flat files**, or splitting `src/puzzle`'s nine
  Lit components out of the runtime code they share a folder with. Both are real
  and both are `group-crowded-source-directories`, which lands after this one so
  it moves files once, not twice.
- **Rewriting history.** Spec prose that narrates the past in the past tense
  ("`puzzles/galaxies.c` was deleted", "the corpus was recorded by the C
  harness") keeps its old paths. Only live claims about where code *is* get
  swept. See `design.md` D1.

## Impact

- **Affected specs**: `repo-layout` (3 requirements modified), `ts-engine` (1
  added, plus a mechanical path sweep), `random` (2 modified, 2 removed),
  `combi` (2 modified).
- **Affected code**: ~670 tracked `.ts` files move or have imports rewritten,
  and *the vast majority need no edit at all* — a game reaching the engine as
  `"../../engine/…"` resolves identically after both directories hoist together.
  The real edit set outside the moved tree is small and enumerated in
  `tasks.md`: `module-layering.test.ts`, four files in `src/puzzle/`, and five
  under `scripts/`, plus `AGENTS.md` and the two `docs/porting/` guides.
- **Risk**: low and self-revealing. `tsc -b --noEmit` fails on any missed path,
  the layering test fails on any missed inversion, and `vite build` fails on a
  broken asset reference. The one thing none of them checks is git history, so
  every move uses `git mv` (the `repo-layout` scenario already requires it).
- **The probe**: `scripts/feedback-probe.mjs` hardcodes
  `ENGINE = "src/native/engine"`, and `npm run probe -- --verify` is in the
  commit gate. It is repointed in the same commit as the move, or the gate
  blocks — which is the anchor check doing its job.
