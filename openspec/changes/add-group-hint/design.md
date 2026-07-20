# Design — add-group-hint

## Context

Group's port (`src/native/games/group/`) rides on `engine/latin.ts` and defers
`hint()`, the last piece of the Palisade-grade hint bar the fork holds every game
to. The infrastructure is all built (the recording solver, `latin-hint.ts` /
`candidate-hint.ts`, the `HintStep` plan machinery, the refusal→`findMistakes`
coupling, the shell Hint/Auto-Hint buttons). Keen and Unequal are the immediate
templates; Group differs in one structural way that shapes the whole design.

## Decisions

### D1 — Group is placement-first, not elimination-first (the key difference from Keen/Unequal)

Keen and Unequal are candidate-*elimination* games: their signature deductions
prune the cube, and a hint step is usually a `pencilStrike`. **Group's signature
deduction — associativity — forces a *placement*** (`solverNormal` calls
`solver.place`, it does not just clear candidates). So Group's plan is
placement-heavy, and the narration centrepiece is a *why-this-cell-is-determined*
story, not a why-this-candidate-dies one. The plan-preference ladder (D3) puts
Group's own placement deductions ahead of generic culls, inverting Keen's
elimination-first emphasis.

### D2 — Record the two user-solvers; a Group reason type alongside LatinReason

Mirror `recordUnequalDeductions`: thread `solver.recorder` through
`solverNormal`/`solverHard`, emitting a `DeductionRecord` per firing with a
`GroupReason`:

- `{ kind: "associativity"; a; b; c; ab; bc; abc }` — the triple `a,b,c` and the
  three known products `a·b`, `b·c`, `(a·b)·c` that force `a·(b·c)`. Recorded on
  the placement (`solver.place(x, y, n, reason)`), fired in `solverNormal`'s
  associativity loop.
- `{ kind: "identityFill"; e; via }` — element `e` is the identity; `via` is the
  filled cell (`a·b = a`, so `b = e`) that revealed it. Recorded on each
  identity-row/column placement.
- `{ kind: "identityElim"; a; b; product }` — `a·b = product`, neither `a` nor
  `b`, so neither is the identity; recorded on each ruled-out identity mark
  (`cube[cubepos(i, j, j+1)] = 0`) in `solverHard`.

Generic Latin reasons (`single`, `dup`, set, forcing) keep flowing through
latin.ts unchanged and are narrated by `narrateLatinReason`. `HintReason =
GroupReason | LatinReason` exactly as Unequal's `HintReason`.

**Load-bearing constraint:** the recording branch is gated on `solver.recorder`
being set. With it unset (generator/solve path) the code path — and every RNG
draw and deduction verdict — is byte-for-byte what the frozen
`group-c-reference.json` differential froze. The recording early-return
("`return` as soon as one firing fires when recording") lives *inside* the
`if (solver.recorder)` guard so it cannot perturb the un-recorded fixpoint.

### D3 — Plan-preference ladder

Walk a working copy seeded from the **placed entries only** (never the player's
pencil marks — a mark can be wrong, which is what `findMistakes` catches),
preferring at each step:

1. a **naked single** (a cell whose live candidates collapsed to one) → `set`;
2. else, after a lazy **populate** (`pencilAll`, emitted only when some empty cell
   lacks notes), the **basic Latin** row/column culls a placed value implies →
   `pencilStrike` (so a hint resumed from an auto-pencil-off board still teaches
   them);
3. else **Group's own deduction** — an **associativity placement**, an
   **identity-fill placement**, or (identity-hidden) an **identity-mark
   elimination** — the deduction worth teaching;
4. else a forced generic **placement** (naked/hidden single the notes lag),
   narrated by *which* it is (re-derived from the working board, since the
   recorded `single` reason conflates naked and hidden).

Capped **below recursion** — a guess is not a teachable step. (Unreasonable
boards may thus reach a position the hint cannot advance without guessing; the
refusal path, D5, covers it honestly.)

### D4 — Narration: associativity is the teachable centrepiece

Meet the four-part bar (`hint-authoring.md` §2): indication → reasoning →
necessity conclusion, cells named by the element letters they show.

- **Associativity** (the star): *"You've filled a·b = c, b·c = d, and
  (a·b)·c = f. Because (a·b)·c always equals a·(b·c) in a group, the cell a·(b·c)
  — row a, column d — must also be f."* The premise singles out the conclusion
  (all three products known ⇒ the fourth forced); render shades the three known
  products as evidence and rings the target.
- **Identity fill**: *"a·b = a shows b is the identity e; the identity's row and
  column are just the element labels, so this cell is c."*
- **Identity elimination** (hidden mode): *"a·b = c, which is neither a nor b — so
  neither a nor b can be the identity; cross out the identity mark here."*
- **Generic**: defer to `narrateLatinReason` / `singlePlacementReason` /
  `hiddenSingleLine` (naked single "every other element ruled out in this cell";
  hidden single names its line + shades it).

One firing = one journey (`continuesPrevious`): the identity fill forces a whole
row and column at once → one multi-leg journey, not `2w−1` disjoint hints.

### D5 — Refusal couples to the mistake overlay

Refuse (`{ ok: false, error }`) when the board is solved or `findMistakes` is
non-empty; the engine lights the mistake overlay through the existing
refusal→`findMistakes` coupling. A board that needs a guess (deduction capped
below recursion returns nothing new) refuses with an honest "no forced move from
here" message rather than inventing one.

### D6 — Render (display code, tier-2.5 tested)

Append `COL_HINT` (target) and `COL_HINT_CELL` (evidence) past the existing
palette. Fold the hint into the per-display-cell `Int32Array` diff cache via a
hint sidecar, exactly as the mistake overlay's `ds.wrongEdges` sidecar does
(no free key bits — add a parallel `Int32Array`). Evidence shown as an *area*
(the associativity premise is three cells, so it is genuinely non-local — say so:
shade all three). The hint highlights where to act; it never performs the move.

### D7 — Resume safety (the cross-game guard)

`groupGame` joins `hint-resume.test.ts`: a freshly-recomputed hint from any
solvable, mistake-free mid-game position makes progress and leads to a solved
board. `hintKeepTrack` advances on a matching player move (a `set` of the hinted
value → `completed`; a `pencilStrike` clearing a subset → `onTrack`/`completed`);
otherwise drops the plan. `refreshHintStep` drops a stored step's dead marks (or
resolves it) before each re-display. Every step is monotone progress. The
deduction fixpoint keeps the shared step budget.

## Risks

- **The recording early-return must not leak into the un-recorded path** — the
  one way this change could break the differential. Guard it strictly and re-run
  the frozen `group-c-reference.json` differential as the gate (it needs no C
  build — the fixture is committed).
- **Identity-hidden boards** exercise `solverHard` (the elimination path) that
  identity-shown boards may never reach; the fixture matrix and resume test must
  include a hidden board so the `identityElim` narration is actually covered.
- **Esotericness** (Group's standing product risk) is unchanged — a great hint
  helps the few who engage; it does not broaden the audience.

## Open Questions

- **Fold-the-identity-fill vs teach-it under auto-pencil?** Keen folds trivial
  row/column culls into a placement when auto-pencil is on. The identity fill is
  arguably always worth *seeing* as a journey (it is the moment the player learns
  the identity). Recommendation: emit it as one journey regardless of auto-pencil,
  since it is a genuine deduction, not a bookkeeping cull — confirm during
  implementation against how it reads.
