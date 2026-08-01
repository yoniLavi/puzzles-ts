# Tasks — audit-author-known-issues

Run **after** the last unreleased port lands and **before** `retire-c-engine`
deletes `puzzles/` (see the proposal's Sequencing note).

The result is [`audit.md`](audit.md), archived with this change.

## 1. Collect the source material

- [x] 1.1 For each of the 13 x-sheep games, extract the `## Status` section of
      `puzzles/unreleased/docs/<game>.md` verbatim into the audit table.
- [x] 1.2 For each game, extract the `TODO`/`FIXME` block from the top of its
      `.c` — from the working tree where the file survives, from git history
      where per-game deletion already removed it (`git log --diff-filter=D`).
      Every unreleased `.c` was already deleted, so all 13 came from history.
- [x] 1.3 Do the same for the Tatham games this fork *finished* rather than
      ported (Group, Separate, Sokoban, Slide): `puzzles/unfinished/README`
      plus each file's own header comments. The README states only why the
      directory exists; the per-game claims are in the headers. Separate states
      none.
- [x] 1.4 Skim `puzzles.but` and the per-game HTML overviews for admitted
      caveats on released games. **Empty result, recorded**: upstream's prose
      states design facts ("Mines may require a guess"), not faults.

## 2. Reconcile against what shipped

- [x] 2.1 Build one table: game × author-stated point × verdict.
- [x] 2.2 Check each ported game's `design.md` findings first.
- [x] 2.3 Verify a claimed "fixed" against the shipped behaviour. Two verdicts
      turned on reading the code rather than the note: Rome's "loose pixels for
      corners" and Crossing's disabled `free_puzzle` are fixed *by construction*
      and neither design note claimed it.
- [x] 2.4 Flag anything an author called a defect that the port reproduced
      faithfully without recording a reason. **Two found**, both now fixed:
      ABCD's no-op entries and Boats' overflowing fleet display.

## 3. Act on the findings

- [x] 3.1 Land the small, uncontentious fixes, each with a test — ABCD no-op
      entry suppression, Boats fleet-display wrapping, and the Seismic size bound
      split per mode so Tectonic 10×10 is reachable from Custom (see `audit.md`
      §3a: one bound was serving two different limits).
- [x] 3.2 Taste calls to the owner in one batch. **One remained**: Slide's two
      open graphics complaints, and it carries a design of its own, so it went
      to `refine-slide-appearance` rather than to a question — the owner already
      answered the third part (the target green) on 2026-07-30.
- [x] 3.3 File a follow-up change for each item too large to land here, with the
      author's own words quoted in its `## Why`:
      `bound-abcd-generable-sizes`, `add-sokoban-level-packs`,
      `refine-slide-appearance`. A fourth, `reach-ten-by-ten-seismic`, was drafted
      and **withdrawn before implementation** on the owner's question — it is two
      independent projects, buys one board size, and rests on a feasibility
      question nobody has answered. Reasoning and the one experiment that would
      settle it are in `audit.md` §3a.
- [x] 3.4 Where a verdict must outlive `puzzles/`, add it to the game's
      capability spec (`abcd`, `boats`, `seismic`).

## 4. The help pages stop describing the implementation

- [x] 4.1 Move `puzzles/unreleased/docs/*.md` to `help/games/`, and repoint the
      vite entry. They are served to players at `/help/<puzzleId>.html`, so they
      cannot live in the tree `retire-c-engine` removes — and once this project
      edits them they are no longer reference material.
- [x] 4.2 Drop every `## Status` section: a player reading the help for a game is
      not the audience for a statement about its implementation, and such a
      statement goes stale silently the moment the issue is addressed.
- [x] 4.3 Bring each page up to what the port actually ships — Crossing's
      auto-advance and clue-list placement, Spokes' automatic diagonal rule-out
      and satisfied-hub marking, Subsets' reference aid and why its board size is
      fixed, Ascent's two-candidate right-click, Seismic's size bound. Remove the
      first-person authorial voice.
- [x] 4.4 Add the `repo-layout` requirement fixing where these pages live and
      what they are for.

## 5. Close out

- [x] 5.1 Add the `ts-migration` requirement (spec delta) so the reconciliation
      is a named gate before the C reference is removed.
- [x] 5.2 Note the dependency in `retire-c-engine`'s proposal.
- [x] 5.3 Full gate green; `openspec validate audit-author-known-issues --strict`.
- [ ] 5.4 Archive with the audit table included, so it survives the subtree.
