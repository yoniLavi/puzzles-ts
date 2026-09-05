# unify-the-note-taking-cell — tasks

Scaffolded 2026-09-05, from the exploration recorded in
`openspec/postmortems/2026-09-05-gesture-table-withdrawal.md` (Finding 5).
**Ready — there is no task 0.** The population has been read, the split has been
measured, and the design is `border-grid.ts`'s.

The eleven: **abcd, crossing, group, keen, mathrax, salad, seismic, solo,
towers, undead, unequal.** Named rather than counted, and derived rather than
listed by hand where a guard needs the set (a game carrying a pencil-mode flag
*is* the membership test).

## 1. Fold the vocabulary first, alone, and prove the diff is nothing else

Do this as its own commit, before any extraction: a rename mixed into a refactor
is a diff nobody can review by shape.

- [ ] 1.1 One name for the transient pencil flag (`hpencil` / `cpencil` → one)
      and one for its keyboard-cursor companion (`hcursor` / `ckey` → one).
      Pick the name from what it *means*, not from which camp is bigger.
- [ ] 1.2 **Verify the bulk edit by shape, not by a green suite** (AGENTS.md §
      "Method"): assert every changed line in the whole diff is the one intended
      kind of change, then read the exceptions. The `spelling-fold.mjs` idiom —
      fold stdin and diff — is the proof that a respelling diff is nothing else.
- [ ] 1.3 Confirm no player data sees it: no game among the eleven implements
      `encodeUi` (so `Midend.saveGame` writes no `ui`), and prefs persist under
      `GamePref.kw`. **Re-run both checks**; do not cite the proposal.
- [ ] 1.4 The eleven differentials and render snapshots pass **byte-clean**. A
      re-baselined snapshot here means the rename changed behavior.

## 2. Extract the mechanic into `src/engine/note-taking-cell.ts`

- [ ] 2.1 Write the module doc comment first, stating **what lives here and what
      does not**, to `border-grid.ts`'s test: *would a change here have to happen
      in every copy at once?* Not "is this the same text".
- [ ] 2.2 **The press arm.** Takes the two per-game predicates — *can this cell
      take a real entry?* and *can this cell take a pencil mark?* — and reports
      what happened to the highlight. It returns no move.
- [ ] 2.3 **The entry arm.** Takes a symbol the game already decoded and reports
      *set / pencil / clear at this cell, or nothing*, with the no-op
      suppression and the hide-the-highlight-if-the-pointer-drove-it rule in one
      place. It returns no move; each game builds its own.
- [ ] 2.4 Sticky pencil must be correct for **Group**, which offers no
      `pencilSticky` field at all — derived from the game's own declaration, not
      from an exemption roster.
- [ ] 2.5 Convert the games one at a time, in the order abcd → keen → solo →
      towers → unequal → mathrax → seismic → salad → crossing → undead → group.
      Abcd first because it asks neither predicate (nothing is immutable);
      Crossing, Undead and Group last because each layers something real on top.
- [ ] 2.6 **Record every no-go with its reason**, the way `unify-hint-framework`
      did. An arm that will not fit without contortion stays with its game and
      says why — game-specific logic is never bent to fit a contract.

## 3. Guard it structurally, and prove the guard fails

- [ ] 3.1 A guard finding the mechanic by **shape** rather than by name, as
      `cursor-vocabulary.test.ts` finds a cursor off `newCursor()` — so a twelfth
      spelling is caught as surely as the two that were there. **Key on the
      shape; the narrowing is the error.**
- [ ] 3.2 Carry a vacuity guard: assert how many games the sweep looked at.
- [ ] 3.3 **Break it deliberately, watch it go red, restore.** A guard nobody has
      seen fail is a guard nobody has seen work.
- [ ] 3.4 Re-run the `jscpd` measurement over the eleven and record the new
      figure in the change. `border-grid.ts`'s doc comment claims 466 lines is
      the repository's largest cross-game duplication; correct that sentence to
      whatever is true when this lands.

## 4. Documentation and specs

- [ ] 4.1 `docs/games/mechanics.md` § "Pencil marks: the full note-taking UX" —
      point at the module, keep the normative rule in the spec.
- [ ] 4.2 `docs/games/engine-catalog.md` — the new helper, and when to reach for
      it.
- [ ] 4.3 `ts-engine` spec delta: prefer `ADDED` (this adds a concern; it does
      not alter an existing rule). Before any `MODIFIED`, grep the live spec for
      the sentence you mean to change and confirm which requirement holds it.
- [ ] 4.4 `repo-layout` spec: the module's place in the flat engine namespace.

## Standing constraints

- [ ] C1 **Behavior must not move.** Eleven games' pencil UX is exactly what
      shifts by one keystroke under a refactor and is noticed by a player, not a
      suite. Frozen differentials and render snapshots pass byte-clean at every
      commit, or the refactor is wrong.
- [ ] C2 **Owner acceptance**, on at least one game from each of the two naming
      camps and on Group (the member that does not latch). Run the app; a green
      suite is not a rendered frame.
- [ ] C3 An exemplar hint never loses a word to an abstraction. The members that
      declare a `hint()` — the query, not a roster; `HINT_GAMES` derives it —
      keep their narration strings byte-frozen through this. That is most of the
      family, so it is the constraint most likely to be brushed against.
- [ ] C4 `npm run probe -- --verify` after touching anything probed — a refactor
      that moves a quoted anchor line makes the harness measure a smaller corpus
      and *report success*.
