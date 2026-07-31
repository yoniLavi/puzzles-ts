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

- [x] 1.1 Reshape `src/native/engine/palette.ts` into a token table: each token a name,
      a documented meaning, and a value **per scheme** (design D1). Existing roles move
      across unchanged in value — this is a rename-and-restructure, not a retune.
      → Three modules, because the halves have different invariants and a wildcard
      import must see colours only: `colour-token.ts` (the `token()` declaration +
      `darkValue()` reader + the `scale`/`mix` combinators), `palette.ts` (shared
      roles, "each value named once"), `palette-games.ts` (per-game vocabularies,
      game-id-prefixed, duplicate values across games *allowed* — Cube's die face and
      Untangle's vertex are both blue and free to diverge).
- [x] 1.2 Keep derived colours as **functions over tokens** (D2): the `mkhighlight`
      trio, the background-derived roles, Signpost's ramps. Do not flatten them into
      authored values.
      → Measured the split first: resolving every palette at two different host
      backgrounds and diffing separates the 280 game-local entries into **206
      absolute** (138 distinct — these become tokens) and **74 background-derived**
      (these must become named derivations). That classification is now a column in
      `inventory.md`, so the worklist maintains itself.
- [x] 1.3 Resolution: a token with no value for the active scheme falls back to
      `utils/color.ts`'s calculation, so the migration can land game by game (D3).
      → `Midend.darkModeOverrides` (`Record<number, false>`) generalised to
      `Midend.darkPalette` (`Record<number, Colour>`): the authored dark value of every
      index whose token states one, in **sRGB** — the unit the table is written in —
      converted to OKLCH by `puzzle-view.ts`, which already owns the colour-space
      plumbing (this keeps `colorjs.io` out of the worker bundle). An absent index is
      calculated, exactly as before. `false` is gone from the palette side: a token
      that must not move states `dark` equal to its light value, which is the same
      thing said positively. Verified equivalent for `PIECE_BLACK`/`PIECE_WHITE`.
- [x] 1.4 Do **Signpost** first — 70 of the 302 entries, and it is 8 tokens plus
      interpolation (D6). If the design survives Signpost it survives everything.
      → It survived, and better than the design guessed: **10 tokens absorb 51 of the
      70 entries**, because the ramps that do not involve the host background
      (`B8..B15`, `M0..M15`, `D0..D15`, `NUMBER_SET_MID`) are *constants* and can be
      computed in the table, not in the game. `buildPalette` is now pure index
      mapping — the part that has to match the C enum — with zero colour values and
      zero arithmetic. **All 76 entries byte-identical at full precision** (the
      interpolations are exact: `a + w*(b-a)` is upstream's own expression, and the
      `(a+b)/2` midpoints are exactly representable). Upstream's divide-by-**256**
      quirk and its read-while-writing region-15 quirk are both preserved, in the
      table, with the reasoning next to them.

## 2. The mechanical pass: no game holds a literal

- [x] 2.1 Enumerated sets next — flood, guess, samegame, map, mines (D6.2).
      → Three findings recorded on the tokens themselves: Flood's and Guess's ten
      values are **identical** (upstream wrote the list twice) and stay two sets per
      D1; **Flood's hues are a player-visible contract** because its hint says "Fill
      with red", so a scheme may darken a tile but not re-hue it; and Mines'
      count-3 digit and its flag are both pure red but are **not** the `ERROR` role,
      which the old value-based guard had been silently filing them as.
- [x] 2.2 Then the 25 games with ≤3 literals; then the remainder.
      → Done in one pass over the remaining 48 games (79 exact-match source edits,
      any miss an assertion rather than a silent no-op). Two colours were promoted
      to **shared roles** on the audit's own convergence test — `lineNoColour`
      (Loopy's `COL_FAINT`, Palisade's and Separate's `COL_LINE_NO`: three ports,
      identical `background × 0.9`, identical meaning, and the exact sibling of the
      existing `lineMaybeColour`) and `clueDoneColour` (Magnets, Towers and Undead,
      all `background / 1.5` under the same local name `COL_DONE`).
      **No-goes recorded:** cursor stays per game (the audit examined it and found
      17 games with 17 deliberately different cursors — four x-sheep ports agreeing
      does not overturn that); Net and Netslide keep separate prefixes for their
      three shared wire colours (a two-game family is not a collection-wide
      meaning, and the prefix rule is what makes the guard mechanical); and the
      fixed `[0, 0.5, 0]` "you entered this" green in five games is **not** merged
      into the background-derived `playerEntryColour` role, because at 0.4962 they
      differ and merging would be a retune, not a relocation (D3). Left as a
      candidate for a later pass.
- [x] 2.3 Per batch: **zero snapshot movement**. Anything that moves is a mistake to
      find, not a diff to accept (D5).
      → Held throughout; 6033 native tests green with no snapshot re-baselining.
      The rule earned its keep twice, both times on **one ULP**: `scale(bg, 2/3)`
      is not `(bg * 2) / 3` and `scale(bg, 1/1.5)` is not `bg / 1.5`, because
      neither ratio is representable. Invisible on screen, visible in a
      full-precision inventory diff. The fix was `fraction()` and `divide()`
      combinators that keep upstream's *operation*, not just its value.
- [x] 2.4 Regenerate the audit's `inventory.md` as the reviewable artefact — it diffs
      *resolved palettes* across commits, so it proves the relocation changed nothing.
      (Generator recipe is in `2026-07-31-audit-game-colour-palette`.)
      → `scripts/colour-inventory.test.ts`, regenerated after every batch and
      committed, at **full precision** so an ULP cannot hide. It classifies by
      **token identity** rather than by value, which is what let it distinguish
      Mines' red digit from the error red. Across the whole mechanical pass:
      184 lines relabelled, **0 values changed**. 623 of 687 entries (91%) are now
      a token outright; the other 64 are computed from tokens by a shared
      function.

## 3. Author the dark values → **moved to `consolidate-colour-palette`**

Owner direction, 2026-07-31, mid-change: the collection should not *have* ~190
game colours. It should have **~10–20, each with a specific meaning**, with games
referencing semantics — and where a game genuinely wants a named colour (a hint
that says "fill with yellow"), the name must be truthful. That is a separate
change; this one stays the relocation whose review property is *0 values changed*
(design D3, and the reason a 687-entry diff was reviewable at all).

Authoring dark values here would be wasted twice over: ~190 hand-picked values
for tokens about to collapse into ~14, and the enumerated-set problem the
authoring pass exists to solve **disappears by construction** once one
distinguishable named set is designed once instead of per game.

- [x] 3.1 Start with the enumerated sets, where the need is measured.
      → **Measured, not authored.** `scripts/colour-dark-check.test.ts` reproduces
      `puzzle-view.ts`'s dark pipeline and reports worst-pair separation per set:
      flood **0.070** and guess **0.070** against 0.134 in light, samegame 0.097
      against 0.127, map 0.067 against 0.077 (as close in light — no defect), mines
      0.118 against 0.108 (**better** in dark — no defect). A bounded optimiser
      confirmed the deficiency is fixable within hue — flood reaches 0.158 and
      samegame 0.214 by moving lightness ≤0.18 and never losing chroma — so the
      three real cases are settled and the values are the consolidation's to pick.
      The instrument stays; the scratch optimiser was deleted.
- [x] 3.2 Then everything else, game by game.
      → **No defect to fix.** The same tool lists every colour whose relationship to
      the board moves between schemes: **21 of 687**, and every one is a decision
      somebody already made — the `PIECE_BLACK`/`PIECE_WHITE` tokens (guess, inertia,
      mines, pattern, pearl) or an existing `augmentation.ts` override (bricks,
      flood, galaxies, lightup, mines, solo, unruly). `hand-author-dark-palette`'s
      calculated fallback is sound for everything the consolidation does not touch,
      and the spec explicitly supports a token leaving a scheme value unstated.
- [x] 3.3 Retire each `augmentation.ts` `paletteOverrides` entry as its token absorbs
      the decision; note which must stay.
      → Left in place deliberately, and now *audited* rather than assumed: all 21
      background-relationship outliers trace to one, which is the evidence for
      whether each is still earning its keep. Retiring them belongs with the
      consolidation, where the tokens that would absorb them are decided.

## 4. Close the door

- [x] 4.1 Shrink `GAME_LOCAL` to empty as tokens absorb it, then **delete it** rather
      than leaving a permanently-empty escape hatch (D4).
      → Deleted. It was replaced rather than emptied: the same job (notice a *new*
      colour) is now derivable from the table instead of hand-maintained.
- [x] 4.2 Add the check that actually matches the requirement: a lint rule over
      `src/native/games/**` forbidding a numeric colour literal in `colours()`. The
      value-based guard cannot see provenance (audit F6), so it cannot close this on its
      own.
      → `src/native/engine/palette-source.test.ts`, a vitest rule rather than a biome
      one so it can carry its reasoning and its failure messages. **Five** rules, not
      one: no colour literal, no channel-indexing the background, no importing the
      colour combinators, every per-game token imported by the game its name claims,
      and no token nothing uses. Scoped to whole game *sources* rather than to
      `colours()`, because several games build their palette in a helper.
      **Every rule was mutation-tested, and one was broken**: the combinator-import
      rule matched the comment-stripped copy of the source, and an import path is a
      string literal, so it could never fire. The ownership rule then found a real
      bug — `SIGNPOST_REGION_BACKGROUNDS` re-wrapped its eight authored tokens into
      copies, which would have left every named region unable to carry a scheme
      value.
- [x] 4.3 Update playbook §3.3: a new port picks tokens and never writes a colour; if
      no token fits, it adds one to the table with a meaning.
      → Rewritten: the two halves and which one a new colour goes in, naming for
      meaning, derived colours as named functions, the `fraction`/`divide` rounding
      traps, `token(light, dark)` and why a game must assign a token rather than a
      copy, and what the source guard will fail you for.

## 5. Verify and close out

- [x] 5.1 **Demonstrate D7, don't assert it**: change one scheme's appearance wholesale
      from one file, observe the blast radius, revert. The audit's F9 is the template.
      → Gave **172 tokens** an authored dark value with one blanket edit to
      `palette-games.ts`. Typecheck clean, **no game file touched**, and the only
      test that objected was the one deliberately pinning today's set of authored
      tokens (Pearl reported five scheme decisions instead of two — correct). So
      "restyling a scheme is an edit to the table" is now observed, not claimed.
- [x] 5.2 Confirm no game file contains a colour value; confirm adding a third scheme
      would touch no game.
      → The first is enforced continuously by task 4.2's guard across all 57 games,
      not confirmed once. The second follows from 5.1: a scheme is a value per token,
      and the 172-token edit reached every game without touching one.
- [ ] 5.3 Full gate green; `openspec validate colour-tokens-per-scheme --strict`.
- [ ] 5.4 Owner acceptance, then archive.

## Follow-up

`consolidate-colour-palette` — reduce the ~190 tokens this change named to ~10–20
colours with specific semantics, and make every reference semantic except where a
game genuinely wants a named colour, whose name must then be truthful.

## Out of scope

A theme **picker**, persisted theme preference, or a third scheme. This change makes
those cheap; it does not build them.
