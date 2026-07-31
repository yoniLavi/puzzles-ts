# Tasks — consolidate-colour-palette

> Colours **move** in this change — that is the point, and the opposite of its
> predecessor. So the guards that stay green are the ones about *structure* (no
> game holds a colour value; no game imports another game's colour), and the
> artefact that gets read is the before/after inventory (design D5). Render
> snapshots will move: review each as a diff, never a blind `vitest -u`.
>
> Run only the test files relevant to each step; the full suite runs once, at
> commit.

## 1. Design the palette against the hardest constraint

- [ ] 1.1 Choose the **named colours**: truthful, scheme-stable names, a value per
      scheme, sized by "ten mutually distinguishable members" because that is what
      Flood, Guess and Samegame need (D2, and the constraint that makes the number
      an answer rather than a preference).
- [ ] 1.2 Verify the set with `scripts/colour-dark-check.test.ts`'s pairwise metric
      in **both** schemes, not by eye — the baseline to beat is light 0.134 / dark
      0.070. Author the dark values here; this is the pass deferred from
      `colour-tokens-per-scheme`.
- [ ] 1.3 Settle the intensity axis at **two** steps (a solid and a wash) and add a
      third only against a case the two cannot serve (D3). Record any case that
      forces one.

## 2. Define the meanings over it

- [ ] 2.1 Re-express the ~21 shared roles in `palette.ts` as **references** to named
      colours rather than independent values. Where a role's current value is not a
      palette colour, that is a decision to make, not a value to preserve.
- [ ] 2.2 Keep the derived roles derived (D4): the `mkhighlight` trio and everything
      defined relative to the board. Consolidation is about the absolute tokens.
- [ ] 2.3 Check the hint vocabulary survives: `HINT_ACTION` and `HINT_FILL` are two
      roles because a fill behind a digit must stay readable (Towers' blue-on-blue
      note). If the two become one intensity apart, say so; if they cannot, that is
      D3's third step.

## 3. Collapse the enumerated sets

- [ ] 3.1 flood, guess, samegame, map, mines, signpost — most of the token count and
      all of the measured defect. Flood's and Guess's ten values are identical
      today; after this they are the same ten *references*.
- [ ] 3.2 Re-run the pairwise metric per set and record the before/after. Flood and
      Guess should clear their light-mode 0.134 rather than merely improve.
- [ ] 3.3 Check Flood's hint reads true: the tile it calls yellow is yellow, in both
      schemes (D2).

## 4. Collapse the rest

- [ ] 4.1 Game by game: each token becomes a meaning, a named colour, or a written
      exception (D7). No silent survivals.
- [ ] 4.2 Decide the identity cases explicitly rather than by default — Mosaic's teal
      board, Map's muted earth tones, Crossing's OKLCH-matched dimension pair.
- [ ] 4.3 Retire the `augmentation.ts` `paletteOverrides` entries the palette now
      absorbs; keep only genuine per-board judgements and say which.
- [ ] 4.4 Reduce `palette-games.ts` to the exceptions, or delete it.

## 5. Verify and close out

- [ ] 5.1 The structural guards stay green throughout: no game holds a colour value,
      no game imports another game's colour (`palette-source.test.ts`).
- [ ] 5.2 Regenerate `inventory.md` as the before/after artefact (D5).
- [ ] 5.3 Browser pass in **both** schemes over the games whose appearance moved
      most; a green suite is not acceptance.
- [ ] 5.4 Update playbook §3.3 again: a new port picks a meaning, and reaches for a
      named colour only where the name is load-bearing to the player.
- [ ] 5.5 Full gate green; `openspec validate consolidate-colour-palette --strict`.
- [ ] 5.6 Owner acceptance on the **appearance**, then archive.

## Out of scope

A theme picker, a persisted theme preference, or a third scheme. This change makes
a third scheme cheap — it becomes one value per named colour — but does not add
one.
