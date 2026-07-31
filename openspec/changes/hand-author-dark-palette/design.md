# Design — hand-author-dark-palette

## Context

### The measurement that started it

The invariant checked: **a colour should keep its relationship to the board across the
scheme flip.** What was a subtle tint of the background in light mode should be a
subtle tint in dark mode; what was a bold mark should stay bold. Computed as
`ΔL(colour, background)` in each scheme, over all 57 games:

**150 violations across 45 games, all in the same direction** — subtle in light, loud
in dark. Zero in the other direction. One-directional at that scale is a single rule
misfiring, not forty-five games needing taste applied.

The cause, in `src/utils/color.ts`:

| input | function | relative to background? |
| --- | --- | --- |
| grey (`isGrayChroma`) | `invertLightness(lch, bgl)` | **yes** — floors at the dark background |
| chromatic | `adjustChromatic(lch, bgl)` | **no** — compresses into `[bgl+0.15, 0.8]` |

Slide's target zone is a chromatic *near-background tint*
(`mkhighlightSpecific([bg, highlight, bg])`). The floor inverts to L 0.20; the
"slightly green floor" compresses to L 0.78. Two colours 0.089 apart in light mode land
0.427 apart in dark.

### Why it was ever a formula

`color.ts` and `augmentation.ts` are Mike Edmunds', 2026-01-20, from puzzles-web, where
**every game was C/WASM**. A palette computed inside upstream's compiled `game_colours()`
cannot be hand-authored without patching the C that project existed to run unmodified.
The formula was the only option, and the per-index override table was its escape hatch.

All 57 games are TS now. The constraint is gone, and `audit-game-colour-palette` made
the replacement cheap: 59% of every palette resolves to ~18 named roles.

## Decisions

### D1 — The engine resolves the scheme; role tags never cross Comlink

A role must be identifiable at resolution time, which means the palette has to carry
*which role* each entry came from. The obvious carrier — tagging the colour tuple
(`Object.assign([1, 0, 0], { role: "ERROR" })`, structurally still a `Colour`, so no
game changes) — works in-process and **silently loses the tag through Comlink**:
structured clone preserves an array's indices and drops its other own properties. The
palette does cross that boundary (`puzzle-view.ts` → `puzzle.getColourPalette(...)`).

So the tag is real but **private to the engine**: `colours()` is given the scheme,
roles resolve to authored values worker-side, and only plain `Colour[]` crosses. The
consequence is that the app stops adapting a TS game's palette — it keeps per-game
overrides and grey-tinting, and drops `darkModeColor` for these games.

This does *not* contradict the standing doctrine that a game must never adapt for dark
mode (playbook §3.3, `add-loopy-ts-port` F3). That rule exists so 57 games don't each
re-derive dark mode and fight the layer above; it is about **games**. One central
authored table is the opposite failure mode, and the doctrine's own justification —
"the layer that owns the concern should own it" — is why the table belongs in the
engine now that the engine is where colour *meaning* lives.

Only 4 non-game call sites read `colours()`, so the plumbing is affordable.

### D2 — Harvest authored dark values before inventing any

The owner's instruction is to use already-defined dark colours where available and
calculate the rest, and `augmentation.ts` turns out to be a store of hand-made
decisions: absolute OKLCH overrides (`lightup {2: [0.5,0,0], 3: [0.95,0,0]}`,
`bricks {0: [0.4,0,0], 2: [0.6,0,0], 4: [0.1,0,0]}`, `mines {0: [0.2,0,0]}`), scalar
nudges (`{n: 0.8}`), and — most informative — 15 `false`s meaning *"leave this one
alone"*.

Each is evidence about a **role**, recorded per game only because there was nowhere
else to put it. Lifting them is both the authoring work and the deletion of the
override.

### D3 — `INK` and `PAPER` are each two roles, and `augmentation.ts` says so

Seven games override an `INK`/`PAPER` index to `false`, and their comments say exactly
what they are:

| Game | Index | Local name | Comment |
| --- | --- | --- | --- |
| guess | 16, 17 | `COL_CORRECTPLACE`, `COL_CORRECTCOLOUR` | *black and white pegs* |
| mines | 10 | `COL_MINE` | *black mine* |
| inertia | 6 | `COL_MINE` | *black mine* |
| pattern | 1, 2 | `COL_EMPTY`, `COL_FULL` | *white and black squares* |
| pearl | 3, 4 | `COL_BLACK`, `COL_WHITE` | *preserve black, white* |
| unruly | 3–8 | `COL_0`, `COL_1` + bevels | (the black/white tiles) |
| flood | 1 | `COL_SEPARATOR` | *keep black lines between regions* |

None of these is ink or paper. They are **pieces that are black or white**, where the
colour carries the game's meaning: a black peg is black the way a chess piece is
black, and inverting it to near-white states the opposite. Meanwhile the *genuine* ink
uses at the same value — `COL_GRID` in fifteen games, `COL_TEXT` in ten, `COL_BORDER`
in seven — must invert, or text ends up darker than the surface it sits on.

So `PIECE_BLACK` and `PIECE_WHITE` split out. Their dark value preserves black and
white; `INK`/`PAPER` invert. Fifteen per-game overrides become one statement each.

This is the audit's own convergence test (`audit-game-colour-palette` F7) applied to
dark mode: the seven games converged on *the same correction*, which is what a missing
role looks like.

### D4 — The fallback rule: invert chromatic colours too, then restore chroma

For everything with no role — the ~280 declared game-local colours — the calculation
changes to preserve the background relationship, i.e. chromatic colours invert like
greys, then take the existing Hunt-effect chroma boost and neon clamp.

What makes this more than a patch is that it dissolves the tension `adjustChromatic`
said it could not resolve without knowing intended use. **It turns out you do not need
to know the intended use, because the light palette already encodes it in the
lightness**: text and thin lines are dark on light paper, large fills are pale on it.
Inverting therefore sends text light and fills dark — the right answer for both, from
one rule (dark background = 0.200):

| | light L | old dark L | new dark L |
| --- | --- | --- | --- |
| Slide target zone (large fill) | 0.92 | 0.769 | **0.310** |
| Flood tile (large fill) | 0.87 | 0.753 | **0.356** |
| `ERROR` red (mark) | 0.63 | 0.661 | 0.561 |
| Solo killer outline (thin line) | 0.45 | 0.588 | **0.696** |
| ABCD border letters (text) | 0.35 | 0.544 | **0.767** |

The old rule squashed all five into 0.54–0.77 — text and giant fills within 0.23 of
each other, with **text darker than the fills it sits on**. The new one spreads them
0.31–0.77 and puts them in the right order.

### D5 — Light mode is the regression surface, and the suite already guards it

This change is *supposed* to move dark mode, so dark mode's own diff proves nothing.
What must not move is light mode — and every committed render snapshot is a light-mode
frame, so a light-mode regression is already a failing snapshot. Treat any moved
snapshot as a defect in this change until proven otherwise, rather than re-baselining.

### D6 — Scope: roles now, the long tail later if wanted

Authoring the ~18 role dark values covers 59% of every palette in the collection, and
the improved fallback covers the rest to a defensible standard. Hand-designing each
game's identity set — Flood's nine tiles, Guess's twelve pegs, Signpost's seventy
generated arrow colours — is genuine per-game design work, is *not* required for
correctness once the fallback is fixed, and is deliberately left out. Signpost's 70 are
a computed ramp and would need a dark *formula* rather than 70 authored values, which
is its own decision.

## What implementation found

### F1 — The fallback rule works: 150 violations → 2, and the 2 are deliberate

With D4 in place, the ΔL diagnostic drops from **150 violations across 45 games to
two**, both in `unruly`, at indices 3 and 5 — which are exactly two of the six indices
`augmentation.ts` marks `false`. They are the white tile and its bevel, *deliberately*
not inverted.

So after the fix, the only colours still failing the background-relationship rule are
the ones a human explicitly exempted, and they are precisely the `PIECE_WHITE` case
D3 proposes to promote into a role. That is about as clean a confirmation as this kind
of change gets.

Browser (Chrome, dark mode): **Slide's target zone now recedes as a dark green floor
tint** instead of dominating the board, and the main block reads as a deep indigo
piece — the composition light mode has. **ABCD's border letters** — the "text needs
lightness" pole the old comment named — are now bright and clearly legible.

### F2 — Enumerated sets: my eye said regression, the measurement said otherwise

Flood in dark mode looks muddy under the new rule, and I recorded it as a regression
before measuring it. It is not one. Minimum pairwise separation within each enumerated
set (OKLCH distance, worst pair):

| Game | set size | light | **old** dark | **new** dark |
| --- | --- | --- | --- | --- |
| flood | 10 | 0.134 | 0.025 | **0.070** |
| guess | 10 | 0.134 | 0.025 | **0.070** |
| samegame | 8 | 0.127 | 0.082 | **0.102** |
| map | 4 | 0.105 | 0.085 | **0.106** |
| mines | 8 | 0.142 | 0.081 | **0.123** |

The new rule is **better on every set**, and on Flood and Guess it nearly triples the
worst pair (0.025 — visually the same colour — to 0.070). The muddiness is real but
pre-existing, and this change halves it rather than causing it.

The finding that survives is the *shape* of the problem, which is D6's carve-out with
numbers attached: an enumerated set's colours exist to be told apart from **each
other**, and no background-relative rule can protect that, because it is not a property
of any one colour. Flood and Guess at 0.070 against light mode's 0.134 are the
strongest candidates for hand-authored dark sets — the long tail D6 defers, now with
evidence for which end of it to start at.

**Method note, worth keeping:** the screenshot was persuasive and wrong. A palette
claim that can be computed should be computed — an eye comparing two dark greens
adjacent to seven other colours is not a reliable instrument, and "this looks worse"
was about to cost a correct change.

## Risks

- **Dark mode changes in most games at once.** Mitigated by authoring rather than
  guessing, by harvesting the decisions that already existed, and by the ΔL diagnostic
  re-run as an after-check (150 violations must go to ~0).
- **A per-game override tuned against the old formula now overshoots.** The overrides
  are audited as part of the change, not left in place hopefully.
- **Moving scheme resolution into the engine looks like the doctrine violation it is
  not.** D1 states the distinction; the playbook rule about *games* not adapting stays
  exactly as it is, and gets a pointer.
- **`PIECE_BLACK`/`PIECE_WHITE` misclassification.** A colour put in the wrong bucket
  inverts when it should not, or vice versa. The seven documented `false`s are ground
  truth for those games; the rest are classified from their local enum name and use,
  and every one is listed in this change so the classification is reviewable rather
  than implicit.
