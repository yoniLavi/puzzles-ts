# audit-author-known-issues

## Why

**Every third-party puzzle in `puzzles/unreleased/` ships a
`puzzles/unreleased/docs/<game>.md` whose `## Status` section is its author
stating what is wrong with the game — and a port can sail straight past it.**
Crossing shipped that way: its Status opens "This puzzle has severe problems"
and names three (an unfittable clue list, tedious one-cell-at-a-time entry, and
vestigial per-digit colours the author wanted removed), and the port addressed
none of them, because only the `TODO` block at the top of `crossing.c` had been
read. That block covers two of the three more weakly and omits the one that
mattered most. The owner caught it by playing the game.

The immediate gap is closed — the rule to read `docs/<game>.md` before the C is
now playbook §1.0, and Crossing's three points are resolved (`add-crossing-ts-port`
findings F9–F13). But that rule only binds ports written *after* it. **Nine
unreleased games were ported before it existed** (abcd, ascent, bricks,
clusters, mathrax, sticks, subsets, and — pending stage 2 — spokes and
crossing), and nobody has checked their Status sections against what shipped.
The same applies to the author-written notes for Tatham's own games and the
`unfinished/` set.

There is also a **deadline that is easy to miss**: the author's notes live
inside `puzzles/`, which `retire-c-engine` deletes wholesale. Per-game C
deletion leaves `docs/<game>.md` in place (every ported game's file is still
there today), so the material survives until the terminal teardown — and then
it is gone. The audit therefore has to happen **before** `retire-c-engine`, and
anything still outstanding has to be recorded somewhere that outlives the
subtree.

## What Changes

- **Sweep every author-written known-issue list in the tree** and reconcile it
  against what the port actually shipped:
  - `puzzles/unreleased/docs/<game>.md` `## Status` for all 13 x-sheep games;
  - the `TODO` / `FIXME` blocks at the top of each surviving `.c` (and, for
    already-deleted games, the block as it stood in git history);
  - upstream Tatham's equivalents — `puzzles/unfinished/README`, and the
    per-game caveats in `puzzles.but` / the HTML overviews — for the games this
    fork finished (Group, Separate, Sokoban, Slide) and for anything a released
    game's docs admit.
- **Classify every point** into exactly one of: **fixed** (with the commit that
  did it), **deliberately declined** (with the reason — a difficulty curve we
  chose to keep, a rewrite the port didn't justify), **owner decision pending**
  (a taste call to put in front of the owner), or **still outstanding** (a real
  defect nobody has looked at).
- **Land the cheap fixes found**, in the same change where they are small and
  uncontentious; file the rest as follow-up changes with a clear handoff, the
  way Crossing's three points were split between "do it now", "ask the owner"
  and "record it".
- **Preserve the verdicts where they outlive `puzzles/`.** Each game's own
  capability spec gains the author-flagged behaviours that were deliberately
  kept or deliberately changed, so the reasoning survives the subtree's
  deletion. The audit table itself is archived with this change.
- **Add the reconciliation as a `ts-migration` requirement**, so the check is a
  named gate before the C reference can be removed rather than a task somebody
  remembers.

Explicitly **not** in this change:

- **Any rewrite an author asked for that amounts to a new generator.** Seismic's
  Status says its region generator "needs to be completely replaced"; if the
  port has not solved it by then, the audit records it and proposes a change —
  it does not attempt it inline.

## Sequencing

**Run this after the last unreleased port lands and before `retire-c-engine`.**
It needs every port finished (so "what shipped" is knowable) and the `puzzles/`
subtree still present (so the author's notes are still readable). `retire-c-engine`
gains a dependency on it.

## Impact

- Affected specs: `ts-migration` (a new requirement), plus per-game spec
  additions wherever a verdict needs preserving.
- Affected code: only whatever cheap fixes the sweep turns up; the audit itself
  is documentation.
- Blocks: `retire-c-engine`.
