# Design: Solo hint

The Towers/Unequal/Keen hint re-applied to Solo — but Solo is the first
Latin-family game whose solver is **not** `engine/latin.ts`, so the recording
machinery is net-new in Solo's own solver. Read
`docs/porting/hint-authoring.md` §9 first, and the `add-keen-hint` design as the
closest precedent.

## Decisions

### D1 — Recording lives in Solo's own `solver.ts`, not in a shared layer

Keen/Towers/Unequal record for free because `LatinSolver` already records its
`place`/`elim`/`set`/`forcing` steps. Solo's `SolverUsage` is a faithful port of
`solo.c`'s bespoke solver and shares none of that. So the recorder is threaded
through Solo's **own** technique methods. Keep the recorder **opt-in and gated**
(a nullable `recorder` field, written only when set) so the generator and `solve`
paths run the existing code with zero behavioural change — the existing byte-match
C differential is the regression guard, and it MUST stay green after this change.
Do **not** refactor Solo's solver to ride `latin.ts` as part of this change: the
solver was ported verbatim for byte-match fidelity (killer deductions, the
`goto got_result` grading quirk, the recursion tier), and re-deriving it onto the
generic framework would risk diverging the differential for no hint benefit.

### D2 — One firing = one `group` (return-per-firing on the recording path)

Each Solo technique loops over all regions/cells and, on the generate path,
accumulates every elimination it can find in one pass. A recording pass that
didn't stop would lump several regions' eliminations under one `group`, and a
hint step would narrate one region while struck marks bled in from another (the
same trap Towers' `lowerBound` and Keen's `solverCommon` hit). Fix: on the
recording path, **return after the first region/cell whose deduction changes the
cube**, gated on the recorder so the generate path stays byte-identical. One
recorded `group` is then one teachable firing (one row's elimination, one block's
intersection, one cage's pruning, …).

### D3 — Reasons name the firing region; killer cages named by their sum clue

Solo reasons over more region types than any prior Latin-family game, so the
`SoloReason` union is correspondingly richer:

- `single` — naked single (the cell's own candidates collapsed to one);
- `positional` / `hiddenSingle` — a digit that fits only one cell of a
  row/column/block/diagonal (named by *which* region);
- `dup` — a placed/given digit ruled out of the rest of a region;
- `intersect` — a digit confined to one line within a block, ruled out elsewhere
  in that line (carries both regions);
- `set` — a naked/hidden subset (names the locked digit set and its region);
- `forcing` — a forcing-chain contradiction;
- `cageSingle` / `cageMinMax` / `cageSums` / `cageIntersect` — the killer
  deductions, each carrying the cage's cells and sum clue, narrated with a goal
  phrase ("this cage must sum to 17, …").

A placement's recorded reason conflates naked vs hidden/positional singles, so —
as in Keen — the *why* is **re-derived from the working board at emit time**
(`singlePlacementReason`-style), not taken from the recorded op, so a hidden
single is narrated by its line rather than mis-claimed as "every number ruled out
in this cell".

### D4 — Givens ⇒ the basic-region opening is load-bearing (like Unequal)

Solo has givens. The recording solver seeds its cube from the placed grid
(givens + player entries) and culls each placed digit from its row/column/block/
diagonal during cube allocation, **before** recording is enabled — so those
"obvious" dups are never in the recorded script. A player who fills cells with
auto-pencil *off* leaves the same dups live in their notes. The plan therefore
keeps the **basic-region** sweep Unequal introduced (`basicLatinStrike`,
generalised here to also sweep the block and, on X boards, the diagonals): the
first placed/given digit still live as a note elsewhere in one of its regions is
struck and taught explicitly. It re-derives from the current filled cells each
recompute (resume-safe) and finds nothing on a freshly-populated board with no
stray notes, so it never interferes with the empty-start walk.

### D5 — Killer hints are in scope; capped below recursion

The killer-cage deductions (`KSINGLE`/`KMINMAX`/`KSUMS`/`KINTERSECT`) are recorded
and narrated so the hint works on killer boards (the base port ships the killer
variant; a hint that silently no-ops there would be a parity gap). The recursion
tier (`DIFF_RECURSIVE`) is **not** recorded — the plan caps at `DIFF_EXTREME` /
`DIFF_KINTERSECT`, and on a board only solvable by guessing the hint reports it
cannot deduce the next move. (Standard Solo presets up to Extreme and all killer
presets are deductive; only Unreasonable needs a guess.)

### D6 — Reuse the existing first-class-notes machinery

`pencilStrike`, the auto-pencil/sticky/fill-all UX, and `findMistakes`
note-mistake detection all shipped with the base port. The hint adds **no** move
type and **no** `findMistakes` change. Rendering adds only the
`hintPacked`/`drawnHint` sidecar (the diff-key rule, playbook §3.2) and the
`COL_HINT`/`COL_HINT_CELL` palette entries appended past the fork pencil-body.

## Alternatives rejected

- **Refactor Solo onto `engine/latin.ts` to inherit recording** — rejected (D1):
  risks diverging the byte-match differential for no hint benefit; Solo's solver
  is a faithful verbatim port and its value is exactly that fidelity.
- **Per-region single step striking every cell at once** — rejected, same as Keen:
  the narration would say "in these cells" and a multi-cell `COL_HINT` fill would
  wash out the struck candidates. Split one firing into a per-cell journey
  (`continuesPrevious`).
- **Skip the killer deductions** (standard-only hint) — rejected (D5): the killer
  variant ships; a hint that no-ops on it is a parity gap the owner did not
  approve.
- **Skip the recursion-tier cap and try to narrate a guess** — rejected: a guess
  is not a sound note strike; the resume guarantee (every step monotone, mistake-
  free) would not hold.
