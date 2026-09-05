# unify-the-note-taking-cell — tasks

Scaffolded 2026-09-05, from the exploration recorded in
`openspec/postmortems/2026-09-05-gesture-table-withdrawal.md` (Finding 5).
**Ready — there is no task 0.** The population has been read, the split has been
measured, and the design is `border-grid.ts`'s.

The eleven: **abcd, crossing, group, keen, mathrax, salad, seismic, solo,
towers, undead, unequal.** Named rather than counted, and derived rather than
listed by hand where a guard needs the set (a game carrying a pencil-mode flag
*is* the membership test).

## 1. Fold the vocabulary first, alone, and prove the diff is nothing else — DONE

- [x] 1.1 `hpencil`/`cpencil` → `pencilMode`; `hcursor`/`ckey` →
      `cursorFromKeyboard`. `pencilMode` was not a coinage: eight of the eleven
      renderers already called the same concept `pencilModeShown`.
- [x] 1.2 Verified by shape. No file mixes the camps, so the map is invertible
      per file: 371 occurrences across 42 files fold back byte-identically. The
      longer names then made biome reflow seven files, so each was folded back,
      re-formatted and compared to HEAD — 40 byte-identical, 2 identical once
      line breaks and biome's inserted trailing commas are ignored.
- [x] 1.3 Re-checked: none of the eleven implements `encodeUi`, so `saveGame`
      writes no `ui` at all; prefs persist under `GamePref.kw`.
- [x] 1.4 Byte-clean, no snapshot re-baselined.
- [x] 1.5 **Not planned, found on the way:** Ascent carries the same
      cursor-provenance fact under a third spelling and the *opposite* polarity
      (`cursorFromMouse`). Inverted in its own commit, with the test that pins
      it — Ascent's suite never pressed an arrow, so the inversion would have
      shipped green either way.
- [x] 1.6 **Also found:** five doc comments describing fields
      `unify-cross-game-vocabulary` had deleted, each silently documenting the
      member below it. Cleared, and `asset-integrity.test.ts` gained a source
      scan so the shape cannot come back.

## 2. Extract the mechanic into `src/engine/note-taking-cell.ts` — DONE

- [x] 2.1 Module doc states what lives here and what does not, to
      `border-grid.ts`'s test.
- [x] 2.2 The press arm — `pressNoteTakingCell`, taking `CellEntry`'s two
      predicates and reporting `"moved"` / `"unmoved"` / `null`. It returns no
      move.
- [x] 2.3 The entry arm, **narrower than planned and deliberately so.** Only
      what happens to the *highlight* moved (`releaseHighlightAfterEntry`,
      `noOpEntryResult`); the keystroke decoding and the no-op predicate stay
      with the game, because they read its own grid and marks.
- [x] 2.4 Group, which offers no `pencilSticky`, is handled by
      `ui.pencilSticky ?? false` — the game's own declaration, no roster.
- [x] 2.5 All eleven converted.
- [x] 2.6 No-go recorded in the module header: the ~28-line clone that survives
      between Keen, Solo, Towers and Unequal is the *move literal*, and lifting
      it would mean a shared `Move` — which `border-grid.ts` already refused,
      because it couples save formats that have no reason to be identical.

## 3. Guard it structurally, and prove the guard fails — DONE

- [x] 3.1 Enrollment is derived from the *shape* of each game's `newUi()`, plus
      a source scan asserting every enrolled game actually calls the arm.
- [x] 3.2 Vacuity guards on both: the registry count and the scanned file count.
- [x] 3.3 Proven to fail three times — reverting standardization 1, renaming
      Salad's call site, and flipping the missing-preference default.
- [x] 3.4 Measured: the eleven `index.ts` files go 514 → 331 (press arm) → 317
      (entry rules). Folding the retired spellings now moves the figure by zero
      where it used to move it by 53. `border-grid.ts`'s "largest cross-game
      duplication" claim is deleted rather than transferred, and its own figure
      re-measured (466 → 213) and dated.

## 4. Documentation and specs

- [x] 4.1 `docs/games/mechanics.md` § "Pencil marks: the full note-taking UX".
- [x] 4.2 `docs/games/engine-catalog.md`.
- [x] 4.3 `ts-engine` delta, `ADDED`: the note-taking cell as one shared
      mechanic, with the two standardized rules, the sticky carve-out, and
      derived enrollment.
- [x] 4.4 `repo-layout` delta, `MODIFIED` on "A bulk mechanical edit is checked
      for shape and for scope" — **not** the flat-namespace requirement this
      task originally guessed at. Grepping the live spec for the sentence found
      that `scripts/check-rename-shape.mjs` already existed for file moves and
      comment sweeps, and had no mode for an identifier rename, which is the
      case where shape says almost nothing. The fold-back proof this change
      hand-rolled twice is now `--fold old=new` in that tool, with the
      reflow-residue reporting the real sweep needed. Proven both ways: 44
      renamed files fold back clean, and a planted unrelated edit is named.

## 5. Four player-visible calls, all made — DONE

Each replaced a disagreement no game could explain in terms of its puzzle, which
is AGENTS.md's test for whether a difference is real. Put to the owner
2026-09-05, who asked for acceptance testing only where the better answer was
genuinely unclear; it was not, on any of these. Recorded here because they are
what a reader of this change most needs to know.

- [x] 5.1 **A press moves the highlight to the pressed cell**, and the cell
      decides only whether it is shown. Five games moved it, five left it
      behind, Towers did both. Verified in Chrome on Solo: clicking a given then
      pressing ↓ resumes from the given.
- [x] 5.2 **The highlight is shown only where the current mode could write.**
      Crossing alone had the clause; elsewhere a sticky-mode left press onto a
      filled cell lit a highlight no keystroke could act on.
- [x] 5.3 **Putting the highlight away no longer clears pencil mode**, on either
      arm. Only Undead did that, and the entry arm's version contradicted its own
      sticky-pencil preference — whose label promises the mode "stays on until
      right-clicked again". Verified in Chrome: the indicator survives a
      mouse-driven mark.
- [x] 5.4 **The keep-highlight split is resolved, not left standing.** Six games
      offered the preference defaulted **off**; five offered none and behaved as
      if it were on. Keeping the highlight is the better default — entering two
      or three candidates in a row is the ordinary case with a mouse, and
      re-clicking between each is the annoyance the preference exists to remove
      — so the six flipped and the five gained the preference. Every player can
      still choose; nobody chooses twice for the same family. Guarded over the
      derived population, both halves proven to fail.

## 6. Also found and fixed while here

- [x] 6.1 Group hand-wrote the keep-highlight preference inline rather than
      calling `pencilKeepHighlightPref()`. The label matched, so
      `pencil-prefs.test.ts` passed — it guards drift, which is what it claims —
      but a copy is a copy. It calls the helper now.

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
