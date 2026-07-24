# Tasks — audit-author-known-issues

Run **after** the last unreleased port lands and **before** `retire-c-engine`
deletes `puzzles/` (see the proposal's Sequencing note).

## 1. Collect the source material

- [ ] 1.1 For each of the 13 x-sheep games, extract the `## Status` section of
      `puzzles/unreleased/docs/<game>.md` verbatim into the audit table.
- [ ] 1.2 For each game, extract the `TODO`/`FIXME` block from the top of its
      `.c` — from the working tree where the file survives, from git history
      where per-game deletion already removed it (`git log --diff-filter=D`).
- [ ] 1.3 Do the same for the Tatham games this fork *finished* rather than
      ported (Group, Separate, Sokoban, Slide): `puzzles/unfinished/README`
      plus each file's own header comments.
- [ ] 1.4 Skim `puzzles.but` and the per-game HTML overviews for admitted
      caveats on released games (upstream states some in prose, not in code).

## 2. Reconcile against what shipped

- [ ] 2.1 Build one table: game × author-stated point × verdict, where the
      verdict is **fixed** (name the commit), **declined** (name the reason),
      **owner decision pending**, or **outstanding**.
- [ ] 2.2 Check each ported game's `design.md` findings first — several points
      were already resolved and recorded (Crossing F9–F13 is the worked
      example); the audit confirms rather than re-derives those.
- [ ] 2.3 Verify a claimed "fixed" against the shipped behaviour, not against
      the design note. A design decision that was written and then reverted
      during implementation is exactly what this sweep exists to catch.
- [ ] 2.4 Flag anything an author called a *defect* that the port reproduced
      faithfully without recording a reason — that is the failure mode.

## 3. Act on the findings

- [ ] 3.1 Land the small, uncontentious fixes in this change, each with a test.
- [ ] 3.2 Put every taste call to the owner in one batch (Crossing's colour
      question is the shape), rather than deciding them unilaterally.
- [ ] 3.3 File a follow-up change for each item too large to land here, with the
      author's own words quoted in its `## Why`.
- [ ] 3.4 Where a verdict must outlive `puzzles/`, add it to the game's
      capability spec — the deleted subtree must not take the reasoning with it.

## 4. Close out

- [ ] 4.1 Add the `ts-migration` requirement (spec delta) so the reconciliation
      is a named gate before the C reference is removed.
- [ ] 4.2 Note the dependency in `retire-c-engine`'s proposal.
- [ ] 4.3 Full gate green; `openspec validate audit-author-known-issues --strict`.
- [ ] 4.4 Archive with the audit table included, so it survives the subtree.
