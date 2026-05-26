# Design: add-pegs-ts-port

## D1: File split — single file vs multi-file

**Decision: Single file (`index.ts`)**

Pegs is ~1400 lines of C, comparable to Flip's ~970 lines of C that became a 966-line single file. The game has no solver, no complex state encoding, and no separate generator algorithm (the RANDOM generator is ~200 lines). A single file keeps it simple and matches the Flip precedent. The Galaxies 6-file split was justified by ~3000 lines of TS; Pegs won't reach that.

## D2: Grid representation — Uint8Array vs enum array

**Decision: `Uint8Array` with named constants**

C uses `unsigned char *grid` with `GRID_HOLE=0, GRID_PEG=1, GRID_OBST=2`. The TS port mirrors this with a `Uint8Array` and exported `const` values. This is the same pattern Galaxies uses for its typed-array grid. An enum would add indirection for no benefit — the values are stored in a flat array, not individually typed.

## D3: Move representation — discriminated union

**Decision: `{ type: "jump", sx: number, sy: number, tx: number, ty: number }`**

C encodes moves as `"sx,sy-tx,ty"` strings parsed by `sscanf`. The TS port uses a typed discriminated union — the only move type is a jump (source → target, 2 squares apart). The `serialiseMove`/`deserialiseMove` methods convert to/from the C string format for save compatibility.

## D4: SortedMultiset — local copy vs promoted

**Decision: Local copy**

Pegs' generator uses two `SortedMultiset`s with different comparators (by-move, by-cost). This is the same data structure Flip uses, but the second-consumer rule says promote only when a *third* game needs it. Two local copies (Flip's and Pegs') is acceptable. If a third game needs it, promote at that point.

## D5: Octagon starting-hole selection

**Decision: Port the three-equivalence-class logic verbatim**

The Octagon board has a well-known parity constraint: the centre hole is insoluble. C picks a random starting hole from the three equivalence classes of solvable positions. This is pure combinatorial logic with no design choice — port it faithfully.

## D6: Drag rendering — blitter vs redraw

**Decision: Blitter-based drag sprite, matching C**

C uses `blitter_save`/`blitter_load` to snapshot and restore the area under the dragged peg. The TS port uses the same approach via `GameDrawing.blitterNew`/`blitterSave`/`blitterLoad`. This is the first game to exercise the blitter API in a TS port.

## D7: Cache key — Int32Array

**Decision: No packed cache key needed**

Pegs' per-tile cache is trivial: each cell stores a single byte (GRID_HOLE/PEG/OBST + cursor/jumping flags). The C code just compares `v != ds->grid[y*w+x]`. The TS port does the same — a simple `Uint8Array` cache, no packed-bit key needed. The `bgcolour` change (flash) forces a full redraw, matching C.
