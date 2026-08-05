# add-sticks-hint

## Why

Sticks ships no `hint()`. Explained hints are a core deliberate-divergence
product value of this fork, and Sticks is a pure logic puzzle with a
guess-free generator — the precondition the hint-authoring guide §1A names —
so it qualifies for the full Palisade-grade bar rather than the Inertia
non-deductive exemption.

It is also unusually well set up for one, for a reason established by
measurement rather than assumption. `add-sticks-difficulty-tiers` (withdrawn
2026-08-05) proved that the shipped deduction **already decides every
uniquely-solvable board this generator produces** — of 300 candidate boards, 0
were uniquely solvable but unsolved. So a recorder over that one technique can
narrate *every* board to completion, with no un-narratable residue and no
"just because" fallback to smuggle in. The standing bar in §1A — a hint step
always names its technique — is reachable here without strengthening anything.

The technique also lands on the right side of the guide's hardest boundary.
§1B.1 warns that *single-level forcing* is sound deduction but not a
glance-able step, because a contradiction surviving to a forcing rung has to
combine several constraints. **Sticks' contradiction does not propagate at
all**: `sticksTry` places one tentative orientation and calls `sticksValidate`
*once*. The contradiction is therefore immediate and local — one clue, one
violated rule — which is exactly one inferential step and satisfies §1B without
needing the tentative-mark what-if walk that remains an unbuilt cross-game
engine feature.

## What Changes

- **A recording pass over the existing deduction**, emitting one firing per
  forced cell, each carrying *which* clue broke and *how*. `sticksValidate`
  already collects offending clue cells in its `errors` array but discards the
  clause that tripped; the recorder captures it at the point of detection
  (hint-authoring §2.4: only the finder knows why).
- **Five named contradiction kinds**, one per branch `sticksValidate` can fail
  on, each with its own narration. They are already distinct code paths; the
  change names them and gives each a sentence.
- **A `COL_HINT` highlight**, which Sticks' palette does not yet have, plus the
  evidence area the contradiction reasons over (§5.2).
- **Enrollment in `testing/hint-games.ts`** — one line, which buys the resume,
  purity, no-op, overlay and narration-quality guards at once (§7.1).
- **The recorder must run from the player's marks.** `sticksSolveGame` opens by
  wiping every white cell, so it cannot be replayed as-is — the Boats case in
  §3, verified here: the withdrawn tiers change had to write a no-wipe variant
  in its own test before its search would work at all.

## Impact

- Affected specs: `sticks`, and `ts-engine`'s hint requirement gains Sticks as
  an implementer.
- Affected code: `src/games/sticks/{solver,index,render}.ts`,
  `src/engine/testing/hint-games.ts`, `help/games/sticks.md`.
- **No board changes.** The recorder is a parallel pass gated on the hint path;
  the generator's `sticksSolveGame`/`sticksValidate` calls stay byte-identical,
  so the frozen differential fixtures are untouched by construction. Any
  fixture movement means the recorder leaked onto the solve path.
