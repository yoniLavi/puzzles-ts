# share-the-border-grid-renderer — tasks

Scaffolded and implemented 2026-09-05. The measurement is in the proposal; the
design is `border-grid.ts`'s own test, applied to the third of its three layers.

## 1. Confirm the one fact the extraction rests on — DONE

- [x] 1.1 The packed tile flags are draw-state only: `ds.cache`, allocated fresh
      by `newDrawState` and filled with `-1`, never serialized and nowhere near
      a desc or a save. So the bit layout was free to unify — the two games had
      differed (Separate's `F_CORRECT` bit 23, Palisade's bit 28, because
      Palisade reserves 23–27 for hint bits).

## 2. Move the mechanic's third layer — DONE

- [x] 2.1 Geometry: `tileWidth`, `center`, `borderGridSize`; the two `margin`
      copies deleted in favor of `border-grid.ts`'s.
- [x] 2.2 One flag layout, with `GAME_FLAG_SHIFT` as a named floor for a game's
      own bits — asserted in a test, because a collision between a new shared
      flag and a new game flag is invisible: it shows up as a tile that fails to
      redraw.
- [x] 2.3 The error model (`borderErrorBits`), the cursor bits (`cursorBits`),
      the dangling-wall invalidation and the Check & Save fold
      (`mistakeEdgeBits`) — that last one found on the second measurement pass,
      as the only render clone left after the first.
- [x] 2.4 The four edge rects and the half-grid cursor.
- [x] 2.5 Each game keeps its clue layer, through a `drawContent` callback that
      gets both the body rect (what an inset outline wants) and the tile origin
      (what a centered glyph wants).
- [x] 2.6 No no-gos: everything measured as shared moved. What is left between
      the two games is 72 lines, and it is `state.ts` — the desc codec and the
      params — which is each puzzle's own.

## 3. Prove it moved nothing — DONE

- [x] 3.1 **Both render snapshots byte-clean**, 225 and 237 recorded draw ops
      with coordinates and resolved colors. Never re-baselined at any point.
      This is the whole assurance and it is a strong one: a pure extraction of a
      renderer either changes no draw call or it is wrong.
- [x] 3.2 Both differentials byte-clean.
- [x] 3.3 Run in Chrome: Palisade renders, and its **explained hint still
      paints correctly** — evidence outlines on the two referenced clue cells,
      the forced edge in `COL_HINT`, the narration unchanged. Separate renders,
      including its half-grid cursor.
- [x] 3.4 A source scan asserts every game using `interpretBorderGridInput` also
      uses the shared renderer — the reverse direction, which the snapshots
      structurally cannot see. Proven to fail by repointing Separate's import.

## 4. Documentation — DONE

- [x] 4.1 `border-grid.ts`'s header amended honestly: the generic sentence
      survives verbatim and is marked as not reaching this far, with why the
      question was reopened.
- [x] 4.2 `docs/games/engine-catalog.md` — the new module, and the reopened
      decline as the part worth reading before reopening another.
- [x] 4.3 `docs/games/rendering.md` § "When two games share a mechanic, they
      share its look too" — the three things that generalize: a callback is
      honest when order is the point; the diff key is part of the contract and
      unifying a bit layout is free only for draw state; the proof is a
      byte-clean snapshot.

## Standing constraints

- [x] C1 Palisade's exemplar hint untouched — its suite passes unchanged and the
      frame was checked in the browser.
- [x] C2 No `game === "palisade"` branch exists in the shared renderer. Every
      difference is expressed as the game's palette indices, its `drawContent`,
      or its own validity computation.

## Measured

| | before | after |
| --- | --- | --- |
| duplication between the two games (jscpd, ≥10 lines / ≥70 tokens) | 213 lines | **72** |
| `palisade/render.ts` | 378 lines | 263 |
| `separate/render.ts` | 331 lines | 207 |
| shared module | — | 348, of which 106 are comment |

**Total lines went up, and that is the honest number**: 709 → 818. The
duplication went 213 → 72 and the mechanic's look now has one definition; what
grew is documentation and two explicit palette mappings that were previously
implicit in each game's `COL_*` ordering. A line count is not the thing being
optimized, and saying so is better than picking a metric that flatters.
