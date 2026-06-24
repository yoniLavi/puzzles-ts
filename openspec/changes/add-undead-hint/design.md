# Design: Undead hint

Undead is a candidate-elimination (pencil-note) game per `hint-authoring.md` §9,
**but not a Latin game** — it does not ride `engine/latin.ts`. Its candidate state
is the per-cell monster bitmask (`1` ghost / `2` vampire / `4` zombie / `7`
undecided), and its deductions come from the mirror-bouncing sightline clues and the
monster totals via its own `solveIterative`. Read §9 first; this design records where
Undead diverges from the Towers/Unequal/Keen template. The narration rules (§2),
rendering conventions (§5), and cross-game guards (§7) all still apply unchanged.

## Decisions

### D1 — Record off Undead's own iterative solver, not a Latin cube

The shared `latin.ts` recorder does not apply. Build a parallel recording driver in
`undead/solver.ts` that runs the same iterative narrowing as `gradeUndead` but, on a
recorder-gated path, captures each candidate elimination with its reason. The
soundness boundary of §9.1 holds: **seed the working candidate grid from the placed
grid only** (`common.fixed` cells + the player's real `state.guess` placements, all
others `7`/undecided) — **never** the player's pencil notes, which may be wrong
(crossing out the true monster is exactly what `findMistakes` flags). The notes are
used only to *diff* (which already-true elimination to surface next, what is done)
and to *render*.

Three recorded reason kinds:

- **`sightline { path, clue, end }`** — one pass of `solveIterative` over one path
  removed a monster value from one or more of the path's cells. The reason carries
  the path (for the highlighted bounce area) and which of its two clues (start/end)
  and counts drove it. **One pass over one path is one firing** — the recording
  driver records all of that pass's eliminations under one `group`, then the planner
  splits them **by cell** into a `continuesPrevious` journey (§9.3 region/cage
  pattern: the shaded area — the whole sightline — stays constant across the legs,
  each leg names "this cell").
- **`total { monster }`** — `checkNumbers` is the *global* total constraint, folded
  inside each path's enumeration in the production solver. Surfacing a sightline
  narration when the real reason is "all the vampires are already placed" would
  mislead (§5.6 honesty), so the planner detects total-exhaustion *directly* off the
  placed grid (count placed monsters of each type vs `common.numGhosts/Vampires/
  Zombies`) and emits a `total` strike of that monster from every undecided cell as
  its own journey, **before** falling through to sightline passes. Evidence = the
  count block + the struck cells.
- **`single { monster }`** — surfaced by the planner (not the recorder) when a
  working cell's candidates collapse to one, exactly like a Latin naked single. On a
  mistake-free board that monster is the truth, so placing it is sound.

Gate every reason allocation on the recorder flag so `gradeUndead` /
`findUndeadSolution` (generate / solve / `findMistakes`) run identically to today —
the C differential is the guard.

### D2 — Plan order: naked single → total → sightline → forced placement

`buildSteps` walks a working copy (placed grid + a derived candidate grid) and at
each step takes the most natural move:

1. **Naked single** — an undecided cell whose working candidates are one monster →
   a `set` placement ("only one monster keeps this cell consistent").
2. (lazy `markAll` populate — emitted only when an *elimination* first needs notes to
   strike; a naked single needs none, so populate stays out of the way until a strike
   is due, per §9.3's lazy-populate lesson.)
3. **Total exhaustion** — a fully-placed monster type → strike it everywhere
   undecided (one journey).
4. **Sightline elimination** — the next path pass that removes a candidate → a
   per-cell `continuesPrevious` journey (§9.3) narrating the mirror-sighting rule.
5. **Forcing deduction** — a candidate eliminated because hypothesising it forces an
   immediate contradiction (the `strengthen-undead-deduction` forcing rung), narrated
   "if this were X, clue Y breaks — so it can't be X"; then any resulting naked single
   places.

Re-record / re-derive from the working grid after each placement; advance through
strikes by filtering to still-live marks. One firing = one (possibly multi-leg)
journey (quality-bar rule 2).

### D3 — No solution-walk; rely on the strengthened deductive solver

The hint is **deductive-only** — it never narrates a guess and never reveals the
known solution. An earlier draft fell back to walking `findUndeadSolution` when the
simple iterative narrowing stalled (Tricky boards that upstream solves only by brute
force). That fallback is **removed**: per the fork's guess-free generation policy
(`hint-authoring.md` §1A), `strengthen-undead-deduction` makes Undead's
Easy/Normal/Tricky tiers solvable by a pure deductive ladder (arc-consistency +
counting + depth-1 forcing), so the plan builder always has a real deduction to
narrate — the forcing rung in particular ("if this were a vampire, the left clue of 2
couldn't be met — so it can't be") covers the boards the old fallback existed for, and
narrates *better*. §7.1's "make progress to a solved board" is therefore satisfied by
genuine deduction, guarded by `undeadGame` joining `hint-resume.test.ts` on Easy /
Normal / Tricky seeds. If `strengthen-undead-deduction` ships a sanctioned
`Unreasonable` tier for genuinely recursion-only boards, a non-deductive hint is
allowed **there only**; the deductive plan covers every other tier.

### D4 — No auto-pencil preference (the Latin divergence)

The Latin ports added an auto-pencil pref because placing a value implies a *trivial*
"strike it from the rest of its row and column" cleanup worth folding away. Undead has
no such trivial elimination — placing a monster does not locally strike a line; its
consequences flow through sightline re-narrowing and totals, both of which are
*teachable* deductions. So Undead's hint takes **no `ui` arg** and adds no auto-pencil
pref; every elimination it surfaces is one it should teach. (This is why `Game.hint`'s
optional third `ui` arg exists but Undead ignores it.)

### D5 — The `pencilStrike` move

Add `{ type: "pencilStrike"; marks: { cell, monster }[] }` to `UndeadMove`: clear the
listed candidate bits atomically. Rationale is §9.2's: the existing `pencil` move
XOR-toggles one bit and is *not idempotent*, so a re-applied strike would re-add the
candidate and a kept/replayed plan would corrupt the notes. `pencilStrike` is
idempotent and resume-safe; one firing forcing several strikes is one multi-cell step.
Populate stays on `markAll`; placement stays on the real `set`. `hintKeepTrack` treats
a `pencil`/`pencilStrike` that *clears* a subset of the step's marks as `onTrack`
(shrink in place) / `completed`, a placement of the hinted monster as `completed`,
else `off` — classified against the **pre-move** state (§3).

### D6 — Narration: teach the mirror-sighting rule, extremes-safe

The sightline narration must teach the rule a player can reuse (§2.2): vampires are
counted **before** the beam first reflects, ghosts **only after** it has bounced,
zombies **anywhere** along it; each path carries two clues (the count seen from each
end). Phrase counts so they hold across the whole range (§2.7): a clue can be `0`
(nothing seen from that end) up to the line's monster count, so avoid "only N" wording
that reads wrong at the extremes; prefer "exactly N". Conclusions use the necessity
voice for deductions (§2.1): a strike "must cross out the vampire", a placement "can
only be a zombie". The evidence *area* is the whole bounce path (§5.2), so the player
sees the beam, not just the acted-on cell.

### D7 — Rendering and the colour legend

Append `COL_HINT` (target / placement) and `COL_HINT_CELL` (sightline evidence shade)
past Undead's existing fork colours; Undead has no dark-mode overrides. Per the
element-type legend (§5.3): the sightline path shades `COL_HINT_CELL`; a struck
candidate is drawn in its **normal pencil colour with a strikethrough** on a
*non*-`COL_HINT` background so the digit/glyph stays legible (§5.3 contrast rule); a
placement target is a solid `COL_HINT` fill (no glyph to hide, §5.1 — never pre-render
the placed monster). Fold the hint signature into the per-cell `Int32Array` diff key
(a `ds.hintPacked`/`drawnHint` sidecar) so the overlay repaints and clears correctly.

## Alternatives rejected

- **Reuse `latin.ts`.** Undead is not a Latin square; its constraints are sightlines
  + totals, not row/column/box uniqueness. Forcing it onto the Latin cube would be a
  worse fit than its own solver already is.
- **Hide totals inside sightline narration** (let `checkNumbers` eliminations surface
  as path eliminations). Rejected — it produces a narration whose stated premise (the
  sightline) doesn't discriminate the move (§2.4 / §5.6); detect and narrate totals
  honestly.
- **Brute-force search narration on Tricky boards.** Rejected — a guess is not
  teachable (§9.1). The unique-solution walk (D3) keeps the plan honest *and*
  progressing.
