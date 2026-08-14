# document-hint-feature — design

Only what is not obvious from the proposal. The writing itself is ordinary work;
these are the three calls that need making before it starts.

## D1: What makes this checkable — a control the app ships with no help section

The gap survived because **nothing could notice it**. `help-coverage.test.ts`
already holds the *per-game* pages and the catalog to each other in both
directions, and the reason that invariant exists is that its absence hid
`separate` having no help page at all. The site-level pages have no equivalent,
and the same class of miss followed.

The honest checkable form is **not** "features.md mentions the word hint" — a
grep for a spelling is a check aimed at a neighbour of the thing it claims to
check, which this repo has now hit six times (`grid.test.ts`'s
`d.edges.length === d.order`, `touch-input.test.ts`'s catalog-vs-registry count,
the silently-empty `import.meta.glob`, and both halves of
`retire-the-upstream-help-tree`'s dead-link grep).

The proposal: derive the feature list from **the app**, not from a hand-written
list. Candidates, cheapest first:

1. **Anchor-based.** Assert `features.md` contains a section with each of a
   small set of anchors (`{#hints}`, `{#checking}`). Cheap; catches deletion;
   does **not** catch a fifth feature shipping undocumented. Honest about that.
2. **Derived from the game hooks.** `HINT_GAMES` and the registry's
   `findMistakes` implementers are already enumerable in-process, so
   "some game implements `hint` ⇒ the features page has a hints section" is a
   real derivation. Still one hop from the *control*, but it cannot go stale
   silently as games are added.
3. **Derived from the command map.** `puzzle-screen.ts`'s `commandMap` is the
   actual list of things a player can invoke (`hint`, and the quick-save
   handlers). Closest to the truth, and the most brittle to parse from a test.

**Recommendation: (2), plus (1)'s anchors as the mechanism.** Take the feature
set from the hooks, require an anchor per feature, and — the part that matters —
**prove the guard fails** before trusting it, by deleting a section locally.
A guard never shown to fail is not known to work; that is the finding
`add-game-difficulty-contract` recorded when its first sampling guard silently
did nothing.

Whatever is built, it must also carry a **vacuity guard** ("the glob found the
pages"), which `help-coverage.test.ts` already models three times.

## D2: The "checkpoint" collision — decide, do not paper over

Three names ship for the one-slot quick-save: the toolbar button reads
**Check & save** where the game can find mistakes and **Quick-save** where it
cannot (an adaptive label, deliberate — `add-quick-save-check-save`), its
success toast reads **"Checkpoint saved"**, and the secondary action is
**Quick-load**. Meanwhile `features.md` §Checkpoints documents an entirely
different feature: the *multi*-checkpoint history panel, with its own
save/rewind/delete affordances.

Two ways out, and this is a genuine trade-off:

- **Rename the toast** to "Quick-save saved" / "Saved" and leave §Checkpoints
  owning the word. Cheapest, and it makes the three shipped names two. Costs: a
  user-visible string change, and "Checkpoint saved" is the friendlier sentence.
- **Keep the word and disambiguate in the help**, e.g. §Checkpoints gains a line
  distinguishing the history panel's checkpoints from the one-slot quick
  checkpoint. Costs: the help now has to carry a distinction the UI does not
  make, which is the weaker place to fix it.

**Lean toward renaming the toast.** A help page explaining why one word means
two things is a help page apologising for the UI. But it is a shipped string on
a path the owner has used, so it is flagged rather than assumed.

**Settled by the owner, 2026-08-12: rename the toast.** "Checkpoint" then means
one thing everywhere — the multi-checkpoint history panel — and the one-slot
feature keeps the two names it already has on its button and menu entry
(**Check & save** / **Quick-save**), which is one fewer than it ships today.
Task 1.1 is closed; the string lives in `src/puzzle/quick-save-actions.ts`, and
`puzzle-screen.test.ts` asserts the success path, so the rename has a test to
follow it.

## D3: Say what governs a missing button, without listing games

29 games have a hint; 36 declare `findMistakes`; 57 ship. So both controls are
sometimes absent, and a features page that describes a button the player cannot
find is worse than one that never mentioned it.

**Do not enumerate the games.** A list of 29 game names in a help page is stale
the day a hint lands, and this repo has already deleted one help page for
carrying implementation state (`audit-author-known-issues`, and the
`repo-layout` rule it wrote). State the *rule* instead — a hint exists where the
puzzle is solvable by deduction and the game can explain its reasoning; mistake
checking exists where a wrong entry can be proved wrong — and let the control's
presence be the answer for any given game.

This also keeps the page on the right side of the existing requirement: it
introduces the *feature*, not the state of its rollout.

## D4: Scope — what this change is not

Not a rewrite of `features.md`. Not per-game help edits (a game whose hint
introduces vocabulary fixes its own page in its own change — that rule already
exists and `add-sticks-hint` followed it). Not a change to any hint, overlay or
save behaviour, beyond the D2 string if it is taken.
