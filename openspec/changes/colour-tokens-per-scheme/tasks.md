# Tasks — colour-tokens-per-scheme

> **Two passes, never mixed** (design D3). *Relocating* a colour into the token table is
> behaviour-preserving by construction and must move **zero** render snapshots;
> *authoring* its dark value is a separate, opinion-bearing commit. A commit that does
> both produces a diff that cannot tell you which happened.
>
> Light mode is the regression surface (D5): every committed snapshot is a light-mode
> frame, so a moved snapshot is a defect until proven otherwise — never re-baseline to
> get green.
>
> Run only the test files relevant to each step; the full suite runs once, at commit.

## 1. Set up the table and prove the shape on one game

- [ ] 1.1 Reshape `src/native/engine/palette.ts` into a token table: each token a name,
      a documented meaning, and a value **per scheme** (design D1). Existing roles move
      across unchanged in value — this is a rename-and-restructure, not a retune.
- [ ] 1.2 Keep derived colours as **functions over tokens** (D2): the `mkhighlight`
      trio, the background-derived roles, Signpost's ramps. Do not flatten them into
      authored values.
- [ ] 1.3 Resolution: a token with no value for the active scheme falls back to
      `utils/color.ts`'s calculation, so the migration can land game by game (D3).
- [ ] 1.4 Do **Signpost** first — 70 of the 302 entries, and it is 8 tokens plus
      interpolation (D6). If the design survives Signpost it survives everything.

## 2. The mechanical pass: no game holds a literal

- [ ] 2.1 Enumerated sets next — flood, guess, samegame, map, mines (D6.2).
- [ ] 2.2 Then the 25 games with ≤3 literals; then the remainder.
- [ ] 2.3 Per batch: **zero snapshot movement**. Anything that moves is a mistake to
      find, not a diff to accept (D5).
- [ ] 2.4 Regenerate the audit's `inventory.md` as the reviewable artefact — it diffs
      *resolved palettes* across commits, so it proves the relocation changed nothing.
      (Generator recipe is in `2026-07-31-audit-game-colour-palette`.)

## 3. Author the dark values

- [ ] 3.1 Start with the enumerated sets, where the need is measured:
      `hand-author-dark-palette` F2 put flood's and guess's worst pairwise separation at
      **0.070 in dark against 0.134 in light**. Author ten mutually-distinguishable dark
      colours per set; verify with the same pairwise metric, not by eye.
- [ ] 3.2 Then everything else, game by game, checking both schemes in Chrome.
- [ ] 3.3 Retire each `augmentation.ts` `paletteOverrides` entry as its token absorbs
      the decision; note which must stay (a genuine per-board judgement such as Light
      Up's lifted black).

## 4. Close the door

- [ ] 4.1 Shrink `GAME_LOCAL` to empty as tokens absorb it, then **delete it** rather
      than leaving a permanently-empty escape hatch (D4).
- [ ] 4.2 Add the check that actually matches the requirement: a lint rule over
      `src/native/games/**` forbidding a numeric colour literal in `colours()`. The
      value-based guard cannot see provenance (audit F6), so it cannot close this on its
      own.
- [ ] 4.3 Update playbook §3.3: a new port picks tokens and never writes a colour; if
      no token fits, it adds one to the table with a meaning.

## 5. Verify and close out

- [ ] 5.1 **Demonstrate D7, don't assert it**: change one scheme's appearance wholesale
      from one file, observe the blast radius, revert. The audit's F9 is the template.
- [ ] 5.2 Confirm no game file contains a colour value; confirm adding a third scheme
      would touch no game.
- [ ] 5.3 Full gate green; `openspec validate colour-tokens-per-scheme --strict`.
- [ ] 5.4 Owner acceptance, then archive.

## Out of scope

A theme **picker**, persisted theme preference, or a third scheme. This change makes
those cheap; it does not build them.
