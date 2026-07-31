# Tasks — hand-author-dark-palette

> Light mode is the regression surface (design D5): every committed render snapshot is
> a light-mode frame, so a moved snapshot is a defect in this change until proven
> otherwise. Never re-baseline one to make the suite pass.
>
> Run only the test files relevant to each step; the full suite runs once, at commit.

## 1. Classify the roles before authoring anything

- [ ] 1.1 List every use of `INK` and `PAPER` with its game, index and local enum name
      (the audit's `inventory.md` has them), and classify each as **structure** (grid,
      text, border, line, outline, clue, arrow — inverts) or **piece** (a black/white
      game object — preserved). 86 `INK` uses, 33 `PAPER`.
- [ ] 1.2 Cross-check the classification against the seven games whose
      `augmentation.ts` entry already says `false` — those are ground truth (design D3).
      A disagreement means the classification rule is wrong, not the game.
- [ ] 1.3 Record the full classification in this change, so it is reviewable rather
      than implicit (design D6 risk).

## 2. Harvest the dark values that already exist

- [ ] 2.1 Extract every absolute OKLCH `paletteOverrides` value, every scalar nudge and
      every `false`, and attribute each to the role at that index (design D2).
- [ ] 2.2 Where several games authored a dark value for the same role, reconcile to one
      and record which won and why — the audit's D4 rule, applied to dark.
- [ ] 2.3 Note which overrides become redundant once the role carries the decision;
      these are deleted in §5.

## 3. The fallback calculation

- [x] 3.1 In `src/utils/color.ts`, make chromatic colours preserve their relationship
      to the background (invert, then Hunt boost + neon clamp) — design D4.
- [x] 3.2 Unit-test the five representative cases in D4's table, so the ordering
      (fills recede, text advances) is pinned rather than eyeballed.
      → `src/utils/color.test.ts`, 8 property-style tests (not value snapshots), incl.
      the one that would have caught the original defect: same lightness in must give
      the same lightness out whatever the chroma.
- [x] 3.3 Re-run the ΔL diagnostic: 150 violations across 45 games must go to ~0.
      Anything left is a real finding — investigate, don't relax the threshold.
      → **150 → 2**, both `unruly` indices already marked `false` in `augmentation.ts`
      (the white tile + bevel). Design F1.

## 4. Roles gain dark values, and the two conflated roles split

- [ ] 4.1 `palette.ts`: each role gains its authored dark value, from §2 where one
      exists and from §3's calculation otherwise. Document per role *why* that value,
      the way the light values are documented.
- [ ] 4.2 Split `PIECE_BLACK`/`PIECE_WHITE` out of `INK`/`PAPER` (design D3) and move
      the games in §1's "piece" column onto them. This *is* a game-file change, but a
      mechanical one: the index and the local name stay, only the imported constant
      changes.
- [ ] 4.3 Extend `palette.test.ts`: every role resolves in both schemes, and each stays
      distinguishable from the background it will be shown against — the existing
      derived-role test, now per scheme.

## 5. Plumbing: the engine resolves the scheme

- [ ] 5.1 Tag role constants so the engine can identify them in-process; keep them
      structurally `Colour` so no game's `colours()` signature changes (design D1).
- [ ] 5.2 Thread the scheme through `Midend.colours` → the worker adapter →
      `puzzle-view.ts`; resolve roles worker-side so only plain `Colour[]` crosses
      Comlink.
- [ ] 5.3 Stop `puzzle-view.ts` adapting a TS game's palette; keep per-game overrides
      and grey-tinting.
- [ ] 5.4 Delete the `paletteOverrides` that existed only to fight the formula (§2.3),
      and re-check the games that keep theirs.

## 6. Verify

- [ ] 6.1 Light mode unmoved: no render snapshot changes (design D5). A moved snapshot
      is a defect until proven otherwise.
- [ ] 6.2 Dark mode in the browser (Chrome, per the standing directive) across a
      spread that exercises each decision: Slide (the reported bug), Pattern or Pearl
      (piece black/white), Solo (text + pencil + entry), Flood or Samegame (large
      fills), ABCD (coloured text).
- [ ] 6.3 Full gate green; `openspec validate hand-author-dark-palette --strict`.
- [ ] 6.4 Update playbook §3.3: a role carries a light *and* a dark value, and a new
      port picks `PIECE_BLACK`/`PIECE_WHITE` over `INK`/`PAPER` when the colour is the
      piece's identity. Keep the "a game never adapts for dark mode" rule as-is, with
      a pointer to why the engine doing it centrally is not the same thing.
- [ ] 6.5 Owner acceptance, then archive.
