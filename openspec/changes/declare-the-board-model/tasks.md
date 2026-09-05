# declare-the-board-model — tasks

Scaffolded 2026-09-04. **Not ready — exemplar-gated.** It was sequenced after
`declare-the-gesture-table`; that change was withdrawn on 2026-09-05, so this is
now the next declaration to be tried. Read the withdrawal's three lessons in the
proposal before task 0.

## 0. Explore, against a game chosen to break it

- [ ] 0.1 `/opsx:explore`.
- [ ] 0.2 **Choose an edge or vertex game as the exemplar** — Palisade or Slant.
      Choosing Towers would prove only that the Latin substrate fits itself.
      `migration.md` names the Palisade re-expression as this design's own test.
- [ ] 0.3 Count what the declaration would actually buy: how many lines of
      `cloneState`, coordinate mapping and cursor movement exist across the 57
      games, and how much of it varies. The claim is "no game writes
      `cloneState` again"; the count decides whether that is worth a declaration.
- [ ] 0.4 Check the four shapes the collection already has — square/tiled cells,
      edge games (`border-grid.ts`), vertex games (Slant), and a two-move-set
      game (Galaxies, per `deduction.md`'s substrate note). A model without an
      answer for all four is a Latin abstraction in disguise.
- [ ] 0.5 Rewrite this task list from what the exploration finds.

## Standing constraints

- [ ] C1 **Existing descs are frozen.** A derived desc codec serves new games;
      existing games keep their byte-stable ones permanently. Weigh this
      honestly — it means this declaration's value is mostly forward-looking,
      which is an argument about *when* to do it.
- [ ] C2 The exemplar must be allowed to fail. If it shows contortion, the
      outcome is a postmortem under `openspec/postmortems/` and a withdrawal —
      the scene-graph precedent — not a per-game hatch that hides the failure.
- [ ] C3 "One function, both callers" (input and paint share the coordinate map)
      is an existing rule; a declaration must make it structural, not restate it.

## Findings

_(none yet — not started)_
