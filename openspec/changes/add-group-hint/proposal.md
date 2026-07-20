# Proposal: Add an explained deduction hint to Group

**Status**: Proposed (scaffold only — implement in a later session)

## Why

The Group TS port (`add-group-ts-port`, archived 2026-07-20) shipped without
`hint()`, exactly as Towers/Unequal/Keen/Solo did before their hint changes. It
is the fifth Latin-square-family game, so its hint is the same well-trodden
pattern: instrument the game's user-solvers to record their deductions through
the shared `engine/latin.ts` recording machinery (the `o³` candidate cube *is* a
pencil-notes representation; `place`/`elim`/`set`/`forcing` already record with
reasons), then narrate.

But Group is the **strongest Palisade-grade candidate in the family**, because
its signature deduction is *genuinely teachable* and unlike the others it forces
a **placement**, not a candidate cull:

- **Associativity** (`solverNormal`): for any `a,b,c`, `(a·b)·c = a·(b·c)`. Once
  the player has filled `a·b`, `b·c` and `(a·b)·c`, the cell `a·(b·c)` is forced
  to that same value. This is the centrepiece — a hint that teaches *why* the
  fourth product is determined by the other three is teaching group theory, not
  just pointing at a cell.
- **Identity reasoning**: once the identity `e` is known (some filled `a·b = a`
  reveals `b = e`), its whole row and column are just the element labels
  (`solverNormal`'s identity fill — placements); and in identity-hidden mode, a
  filled `a·b` that is neither `a` nor `b` proves *neither* is the identity, ruling
  out the identity marks (`solverHard` — an elimination).
- The **generic Latin layers** (naked/hidden single, set elimination, forcing)
  supply the rest, narrated by the shared `latin-hint.ts` helpers.

So the only genuinely new work is recording Group's two user-solvers with
Group-specific reasons and writing the associativity / identity narration; the
plan-building, resume guards, refusal→mistake coupling, hint colours, and shell
buttons all already exist.

## What Changes

- **`solver.ts` gains a hint-only recording mode** for the Group user-solvers.
  Thread the existing `solver.recorder` through `solverNormal`/`solverHard` so each
  placement/elimination is captured with the rule + premise that fired it: an
  `associativity` reason (carrying the `a,b,c` triple and the three known products
  that force the fourth), an `identityFill` reason (the cell named as the
  identity's row/column, carrying which element is the identity and how it was
  learned), and an `identityElim` reason (a filled `a·b` that is neither `a` nor
  `b`, ruling `a`/`b` out as identity). Each user-solver **returns as soon as one
  firing fires on the recording path** (gated on `solver.recorder`) so one recorded
  `group` is one deduction — the family "marks never bleed across the narrated
  step" discipline. With recording off, the generator/solve path is byte-for-byte
  unchanged (verified by the existing frozen C differential). Add
  `recordGroupDeductions` (the raw deduction script a hint narrates).
- **`index.ts` gains `hint()` + `hintKeepTrack()` + `refreshHintStep()`.** The
  plan builder walks a working copy the way a person solves it, preferring: a
  **naked single**; else (after a lazy populate) the **basic Latin** row/column
  eliminations a placement implies; else Group's **own deduction** — an
  associativity placement, an identity-row/column fill, or (identity-hidden) an
  identity-mark elimination; else a forced generic placement. Narration meets the
  quality bar (indication → reasoning → necessity-voice conclusion) and refers to
  cells by the element letters they show. The associativity step names the actual
  triple (e.g. *"you've filled a·b = c, b·c = d and (a·b)·c = f; since
  (a·b)·c = a·(b·c), the cell a·(b·c) must also be f"*).
- **`render.ts` renders the hint.** Append the hint colours (`COL_HINT` /
  `COL_HINT_CELL` past the existing palette; Group has no dark-mode overrides),
  shade the **premise cells** as evidence (for associativity: the three known
  products; for an identity fill: the cell that revealed the identity), mark the
  **target cell(s)** in `COL_HINT`, and — for the elimination case — strike the
  ruled-out identity mark. Folded into the per-cell `Int32Array` diff cache via a
  hint sidecar (the `ds.wrongEdges`-style pattern the mistake overlay already
  uses). Element-type colour legend per the cross-game convention.
- **Tests**: a recorded reason per technique (associativity, identity fill,
  identity elim, generic single); the plan solves a generated board from empty
  *and* from mid-game (`groupGame` joins the shared `hint-resume.test.ts`);
  refusal on solved / on mistakes; `hintKeepTrack` verdicts; a tier-2.5
  render-scenario snapshot of an associativity journey frame.

## Impact

- **Affected specs:** `group` (ADDED hint requirement). No `ts-engine` change — the
  hint hooks, the `findMistakes` refusal coupling, the element-type colour legend,
  and the shell Hint/Auto-Hint buttons all already exist.
- **Affected code:** `src/native/games/group/{solver,index,render}.ts` and their
  tests; the shared `hint-resume.test.ts` list. **No change to `engine/latin.ts`**
  (its recording mode is already complete and shared), and — the load-bearing
  constraint — **no change to the recording-off solver path**, so the frozen
  `group-c-reference.json` differential still passes byte-for-byte.
- Parity-gated: registered hint shipped for owner acceptance; archived only on
  owner acceptance.

## Out of scope

- **Live (rule-violation) error-checking of the grid** — the base port already
  ships `checkErrors` as the render-time associativity/Latin overlay and
  `findMistakes` as the solution-contradiction tier; this change adds no new
  error tier.
- **Strengthening the solver** (the header's TODO inverse/order deductions) — the
  hint teaches the *shipped* difficulty curve, not new techniques.
