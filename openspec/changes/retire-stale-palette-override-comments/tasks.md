# Tasks — retire-stale-palette-override-comments

## 1. Correct the five comments

- [ ] 1.1 `src/games/boats/render.ts:32` and `:109` — drop the invented
      `paletteOverrides: { 4: 0.6 }` for the water; keep why index-for-index
      correspondence with the upstream `COL_*` enum matters.
- [ ] 1.2 `src/games/inertia/render.ts:67` — drop "touch only index 6".
- [ ] 1.3 `src/games/lightup/render.ts:12` and `:57` — drop "target indices 2
      (black) and 3 (light)" / "touch only indices 2/3".
- [ ] 1.4 State the constraint in the present tense, per `AGENTS.md` ("comments
      are not diff annotations"): these games declare no dark-mode palette
      overrides, so an appended index cannot collide with one.
- [ ] 1.5 Leave Pearl's two comments alone — they are accurate (`{ 0: 1.15 }`,
      the board) — and leave the ten "has no overrides" comments alone.

## 2. Guard the class

- [ ] 2.1 A test that reads the `paletteOverrides` entries actually declared in
      `src/puzzle/augmentation.ts` and every `paletteOverrides` mention in
      `src/games/*/render.ts`, and asserts that each comment naming an index
      matches a real declaration for that game.
- [ ] 2.2 Key on the **shape** — a `paletteOverrides` mention with an index near
      it — not on a roster of games, and classify what the superset catches
      rather than narrowing the scan (`AGENTS.md`, "a scan that keys on a name").
- [ ] 2.3 Vacuity guard: assert the number of render.ts files scanned and the
      number of comments matched are both non-zero and equal to the counts
      recorded when the guard is written.
- [ ] 2.4 Prove it fails: change Pearl's declared index from 0 to 1, watch the
      guard go red, restore.

## 3. Close

- [ ] 3.1 `openspec validate retire-stale-palette-override-comments --strict`.
- [ ] 3.2 Full gate, commit, archive.
