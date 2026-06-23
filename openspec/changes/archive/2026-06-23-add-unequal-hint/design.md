# Design: Unequal hint

This is the Towers hint (`add-towers-hint`) re-applied to the second Latin-family
game. The shared recording machinery in `engine/latin.ts` is unchanged; only the
game-specific pieces differ. Read `docs/porting/hint-authoring.md` §9 first.

## Decisions

### D1 — Record the three user-solvers; one firing = one `group` (return-per-firing)

The generic Latin layers (`place`/`elim`/`set`/`forcing`) already record. The
three Unequal user-solvers (`solverLinks`, `solverAdjacent`, `solverAdjacentSet`)
only cleared cube bits; thread `solver.recorder` through them. Each loops over
*every* link / cell+direction and (on the non-recording generate path) accumulates
across all of them — so, exactly like Towers' `lowerBound` block, a recording pass
that didn't stop would lump several clues' eliminations under one `group`, and a
hint step would narrate one clue while struck marks bled in from another. Fix:
`if (solver.recorder && nchanged) return …` after the first firing that changes the
cube, gated on the recorder so the generate path stays byte-identical. One link
(both ends) or one cell+direction adjacency is one firing.

### D2 — No extreme-clue / facing specials; basic-Latin opening instead

Towers opens on note-free forced placements (a clue == grid width climbs the whole
line; a facing pair pins the tallest). Unequal has no such note-free forced moves,
so its plan opens (after a lazy `pencilAll` populate) on the **basic Latin
row/column eliminations** the board's givens imply. This is the one structural
difference from Towers and exists because Unequal boards carry a few givens
(Towers carries ~none): after `pencilAll` fills every empty cell with *all*
candidates, the recording solver's grid-seeded cube has already excluded each
given's value from its row/column (during `alloc`, before recording is enabled),
so those eliminations are never in the recorded script. Rather than bake them into
a smart populate (hint-authoring §9.2 wants `pencilAll` reuse so the basic
eliminations are taught honestly), the plan strikes them as an explicit opening
journey — one `dup`-reasoned step per given/placed value with live row/column
note-dups — before the clue eliminations. This also keeps the plan resumable: the
sweep re-derives from the current filled cells each recompute.

### D3 — Two-mode narration, extremes-safe

`greater`/`lesser` fire only in Unequal mode, `adjacent`/`adjacentSet` only in
Adjacent mode (the ctx links are empty in Adjacent mode). The differ-by-1 narration
is phrased "exactly one away from the N" rather than "N−1 or N+1" so it reads
correctly when N is 1 or `order` (§2.7).

### D4 — Reuse the existing first-class-notes machinery

`pencilStrike`, the auto-pencil/sticky/fill-all UX, and `findMistakes` note-mistake
detection all shipped with the base port. The hint adds no move type and no
`findMistakes` change.

## Alternatives rejected

- **Smart populate** (fill only cube-legal candidates): bakes the basic Latin
  elimination into the fill, which the hint-authoring guide explicitly avoids — the
  player should be taught the row/column cull, not handed it.
- **Recording given placements during `alloc`**: would record their `dup`
  eliminations under `group 0` with the placement-bookkeeping `dup` reason
  (excluded from clue strikes), entangling the shared `latin.ts` for one game's
  givens. The planner-side basic sweep is contained to `index.ts` and needs no
  engine change.
