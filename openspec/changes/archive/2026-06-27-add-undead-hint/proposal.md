# Proposal: Add an explained deduction hint to Undead

**Status**: Proposed

## Why

The Undead TS port (`add-undead-ts-port`, archived 2026-06-24) deferred `hint()`,
exactly as the Latin-family ports did. Undead is a candidate-elimination
(pencil-note) game in the §9 sense — its signature reasoning *narrows a cell's set
of possible monsters* rather than directly forcing one — so it should teach in
pencil-notes terms and meet the same explained-hint quality bar as Towers / Unequal
/ Keen. But unlike those three it is **not** a Latin-square game: it does not ride
the shared `engine/latin.ts` candidate cube. Its deductions come from the
mirror-bouncing **sightline clues** and the **monster totals**, computed by its own
`solveIterative` solver (the `nextList` odometer narrowing each path's cells to the
monster values that survive in *some* legal assignment of that path). So the
recording machinery and the narration are genuinely new work — this is the first
non-Latin candidate-elimination hint in the fork.

The fork already treats Undead's pencil notes as first-class markings — the base
port shipped `findMistakes` flagging a note set that excludes the solution monster
(`kind: "note"`), the sticky/fill-all UX, and the count-style displays. So this
change adds only the explained hint on top, with no `findMistakes` change.

## What Changes

- **`solver.ts` gains a hint-only recording mode.** A `recordUndeadDeductions(...)`
  runs the same iterative pipeline as the grader but, on the recording path,
  captures every candidate elimination with the reason that fired it:
  - **`sightline`** — a path's two count clues rule a monster value out of a cell
    (the core `solveIterative` narrowing: no legal arrangement of the beam that
    shows the clue's counts lets this cell hold that monster). One pass over one
    path is one firing.
  - **`total`** — a monster type's full count is already placed, so it is struck
    from every still-undecided cell (the `checkNumbers` constraint surfaced
    honestly as its own deduction rather than hidden inside a sightline pass).
  - **`single`** — a cell's surviving candidates collapse to one monster (a naked
    single → a placement).
  Recording is gated on a recorder flag so the generator's grading / `solve` /
  `findMistakes` paths run the fixpoint **unguarded and byte-for-byte unchanged**
  (verified by the existing C differential).
- **A new `pencilStrike` move** (atomic clear of a list of candidate bits across
  cells) — the one-firing-one-step note move (§9.2). The existing single-bit
  `pencil` toggle is not idempotent and so is unsafe for a resumable plan; populate
  reuses the existing `markAll`.
- **`index.ts` gains `hint()` + `hintKeepTrack()` + `refreshHintStep()`.** The plan
  builder walks a working copy the way a person solves it: a **naked single** first;
  else (after a lazy `markAll` populate) a **total exhaustion** strike; else the next
  **sightline elimination** (the mirror-sighting deduction worth teaching); else a
  **forcing** deduction ("if this were a vampire, the left clue couldn't be met — so
  it can't be"); else a forced **placement**. The plan is **purely deductive** — it
  never reveals the known solution or runs a search. This depends on
  **`strengthen-undead-deduction`** making Undead's shipped tiers guess-free; the
  hint narrates that change's counting/forcing rungs. (Any genuinely recursion-only
  boards are confined to a sanctioned `Unreasonable` tier by that change, and only
  there — if it exists — may a hint be non-deductive.)
- **Narration teaches the mirror-sighting rule** (indication → reasoning →
  necessity-voice conclusion, §2): name the sightline and its clues, explain that
  vampires are seen before the beam first reflects, ghosts only after it has bounced,
  zombies anywhere — and re-read correctly at the degenerate clue values 0 and the
  line length (§2.7).
- **`render.ts` renders the hint.** Append `COL_HINT` / `COL_HINT_CELL` to the
  palette, shade the driving sightline's cells (the bounce path, `COL_HINT_CELL`) as
  the evidence area, mark the target cell(s) (`COL_HINT`), and draw the struck
  candidate(s) crossed through in the pencil grid — folded into the per-cell
  `Int32Array` diff cache. Element-type colour legend per the cross-game convention
  (§5.3).
- **Tests**: a recorded reason per deduction kind; the plan solves a generated board
  from empty *and* from mid-game (`undeadGame` joins the shared
  `hint-resume.test.ts`) on Easy/Normal *and* Tricky (all now pure-deduction);
  refusal on solved / on mistakes; `hintKeepTrack` verdicts; a tier-2.5
  render-scenario snapshot of a sightline-elimination journey frame.

## Dependency

This change **depends on `strengthen-undead-deduction`** (which makes Undead's
Easy/Normal/Tricky tiers solvable by pure deduction). Sequence that change first; the
hint's plan builder narrates its counting/forcing rungs and carries **no**
solution-walk fallback. Implement `add-undead-hint` only once the strengthened solver
has landed.

## Impact

- **Affected specs:** `undead` (ADDED hint requirement; the `pencilStrike` move is
  folded into the Undead game's move set). No `ts-engine` change — the hint hooks,
  the `findMistakes` first-class-notes convention, the refusal→mistake coupling, the
  element-type colour legend, and the shell Hint/Auto-Hint buttons all already exist.
- **Affected code:** `src/native/games/undead/{solver,index,render,state}.ts` and
  their tests; the shared `hint-resume.test.ts` list. No change to
  `engine/latin.ts` (Undead does not use it).
- Parity-gated: registered hint shipped for owner acceptance; `add-undead-hint`
  archived only on owner acceptance.

## Out of scope

- **An auto-pencil preference.** Unlike the Latin games, Undead has no *trivial*
  row/column elimination to fold away — every elimination goes through sightline or
  total reasoning, which is the teaching. So the hint takes no `ui` arg and adds no
  auto-pencil pref (design D4).
- **Live (rule-violation) error-checking of pencil notes** — same boundary the Latin
  ports drew: Undead checks only the solution-contradiction (`findMistakes`) tier.
- **Any non-deductive step / hidden solution-walk.** The plan never reveals the known
  solution or narrates a backtracking search. `strengthen-undead-deduction`'s re-grade
  measured a **zero** *recursion* residual, so the solver never needs to guess on any
  shipped board — the old solution-walk fallback is gone.
- **Tricky's forcing hint (the deferred decision — D8, owner-steered 2026-06-27).** The
  *cognitive-load* bar (`hint-authoring.md` §1B) is a different cut from the recursion
  line: Easy/Normal are already glance-able single steps, but Tricky's forcing rung is
  intrinsically multi-step. **Out of scope to settle here** — at build time we first try
  to externalise it as a clean guided "what-if" walk (tentative marks); if that can't be
  made clean, the owner's fallback is to **rename the forcing-tier boards `Unreasonable`**
  and keep every shipped non-`Unreasonable` hint straightforward (direct-only). See D8.
