# Port Mines (mines.c) to native TypeScript

## Why

Mines is the game the whole `add-desc-supersede-hook` change was built for. That hook
landed and was accepted (2026-07-14) with **no consumer** — and an engine API with no
consumer is exactly the failure mode that got `PointerAction` deleted. Porting Mines next
proves the hook against the game it was designed from, while the design is still fresh.

It is also, on its own merits, a game this fork wants: Minesweeper is the most recognised
puzzle in the collection, its `minesolve` is a genuinely teachable deduction engine (a
strong future Palisade-bar hint candidate), and it is **unblocked today** — the two leaf
helpers it needs (`randomStateEncode`/`randomStateDecode`, `obfuscateBitmap`/`bin2hex`/
`hex2bin`) are already in the tree, and `tree234` maps onto the existing
`engine/sorted-multiset.ts`.

At **3457 lines** it is a big port, but the shape is lopsided in our favour: ~1030 lines
are the solver and ~615 the generator (the hard half), while the glue and render together
are only ~1100.

## What Changes

- Add `src/native/games/mines/` implementing `Game<MinesParams, MinesState, MinesMove,
  MinesUi, MinesDrawState>`: a `w × h` grid with `n` mines, opened by clicking, flagged by
  right-clicking, chorded from a satisfied number. All 6 upstream presets (9×9/10,
  9×9/35, 16×16/40, 16×16/99, 30×16/99, 30×16/170).
- **Consume the supersede hook** — the point of the change. The board a player starts from
  describes *no layout at all* (`r<n>,<u|a>,<hex RNG state>`); the mine layout is generated
  on the first click so the first click is never a mine, and the desc is then superseded
  with the real board (public `x,y,m<hex>`, private `m<hex>`). `Game.supersededDesc(state)`
  answers exactly this.
- Port the **solver** (`minesolve`): the 3×3 `set` store with its `(y, x, mask)` ordering,
  the trivial / pairwise-wing / subset deductions, the global mine-count deduction with its
  10-set disjoint-union search, and the perturbation callback.
- Port the **generator** (`minegen` + `mineperturb`): uniform mine placement outside the
  3×3 around the first click, then — when `unique` — the solve-and-perturb loop that nudges
  the board until it is deducible **without guessing**, which is what makes every preset
  satisfy this fork's guess-free policy.
- Port the render (numbers in the classic Minesweeper palette, flags, the mine that killed
  you, wrongly-flagged crosses, the "too many flags" wrong-number highlight, the mouse-down
  highlight radius, the death/win flash) and the **status bar** (`Marked: k / n`, the
  "N safe squares remain" tail, and the persistent death counter).
- **Mines is the first timed game the TS engine has ever run** (`isTimed: true`). No ported
  game sets it, so the midend's timer has never been exercised by a real game. Verifying it
  end-to-end in the browser is an explicit task, not an assumption (see `design.md` D3).
- Byte-match differential: a transient `puzzles/auxiliary/mines-trace.c` records
  `(preset, seed, first-click) → layout bitmap` fixtures; a committed gated test asserts the
  TS generator reproduces them exactly.
- Register for owner smoke-testing (stage 1). On owner acceptance, flip `TS_PORTED`, delete
  `puzzles/mines.c`, and archive (stage 2).

## Non-goals

- **No `findMistakes`, deliberately** — and this is a design decision, not an omission. A
  "mistake" in Mines is a flag on a safe square, and *telling the player that* hands them
  the deduction they are playing the game to make. Check & Save correctly degrades to a
  plain quick-save (playbook §3.5's carve-out). Reasoning in `design.md` D4.
- **No explained `hint()`** — a separate change, as it was for every other game.
  `minesolve`'s named deductions make it a strong Palisade-bar candidate.
- No printing (deleted at fork), no editor letters, no preferences (upstream has none).

## Impact

- Affected specs: **new `mines` capability**.
- Affected code: `src/native/games/mines/` (new), `ts-ported-ids.ts` + `games/index.ts`
  (registration), `puzzles/auxiliary/{CMakeLists.txt,mines-trace.c}` (transient),
  `puzzles/CMakeLists.txt` (`TS_PORTED` at stage 2), `puzzles/mines.c` (deleted at stage 2).
- Icons: **already committed** (Mines has always been in the catalog as a C game).
- `puzzles/tree234.c` stays — six C consumers remain after this port.
- Engine: **expected to be zero-change**. If the port needs an engine edit, that is a signal
  the supersede hook got something wrong, and it should be surfaced loudly rather than
  patched quietly — this port is the hook's acceptance test.
