# add-slide-ts-port

## Why

**Slide (Klotski) is upstream's last *unfinished* game worth finishing.** It is a
complete, playable block-sliding puzzle — slide rectangular blocks around a
walled board to bring a designated main block to its exit — that shipped only
behind `PUZZLES_ENABLE_UNFINISHED` and so reached nobody. Its TODOs are polish
(generator variety, graphics), **not** incompleteness: the generator, the
exhaustive BFS solver, and the drag interaction all work.

It is a natural port now. Loopy retired the C runtime; Slide is small
(~2,450 lines), self-contained, depends on nothing not already ported, and its
grab-a-block-and-slide-it interaction is a **movement model this collection does
not yet have**. Porting it finishes the game and forces one owner decision:
whether Slide joins the catalog as a shipped puzzle (this fork already carries
its two icons). This mirrors the stance the owner has taken on `separate`, the
other unfinished experiment.

## What Changes

- **`src/native/games/slide/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`, plus a
  small `moves.ts` if the drag renderer needs the release-move helper).
- **An idiomatic replacement for `tree234` in the BFS solver.** Upstream uses
  `tree234` two ways at once — a *sorted visited set* (dedup by `memcmp` of the
  canonical board bytes) and a *positional FIFO queue*. Neither is an ordered
  multiset, so this is a `Set`/`Map`-keyed visited set plus a plain array queue,
  **not** a `tree234` port and **not** `SortedMultiset` (design D1).
- **Drag-to-slide input** — grab a block, drag it (snapping to the nearest
  reachable cell), release to commit — plus spacebar stepping through a stored
  Solve path. No keyboard cursor. **No interpolated slide animation** — upstream's
  `game_anim_length` is `0`; the live feedback is the dragged piece following the
  pointer with a landing shadow, and a completion flash only (design D3).
- **A byte-match differential** against a new `puzzles/auxiliary/slide-trace.c`,
  covering every preset and a size sweep, asserting the TS generator reproduces
  the C desc and the TS solver reports the same minimum move count.
- **Stage 2, on owner acceptance**: move `puzzle(slide …)` from
  `puzzles/unfinished/CMakeLists.txt` into the **main** `puzzles/CMakeLists.txt`
  with `TS_PORTED`, delete `puzzles/unfinished/slide.c`, and rebuild.

Explicitly **not** in this change:

- **An explained hint** — Slide is non-deductive; if it ever gets a hint it is a
  solver-path hint in its own change, per every prior port.
- **`findMistakes` / Check & Save hard-block** — Slide has no notion of a
  wrong-but-legal state (every reachable position is legal), so it correctly
  omits `findMistakes`, exactly as Sixteen and Fifteen do (design D2).

## Impact

- Affected specs: new `slide` capability.
- Affected code: new `src/native/games/slide/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/slide-trace.c`.
- Stage 2 moves Slide into the catalog (an owner decision, see design D9) and
  deletes `puzzles/unfinished/slide.c`.
- No icon work: `src/assets/icons/slide-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
</content>
</invoke>
