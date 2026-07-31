# Design — consolidate-colour-palette

> **Read first:** `colour-tokens-per-scheme` (the table this change collapses, and
> why its diff had to change no values), and behind it the archived
> `2026-07-31-audit-game-colour-palette` (what a role is, the convergence test) and
> `2026-07-31-hand-author-dark-palette` (why dark mode inverts, and the measured
> enumerated-set weakness this change is the real fix for).

## Context

### What the table actually contains

| | count |
| --- | --- |
| Palette entries across 57 games | 687 |
| …resolving to a token outright | 623 (91%) |
| …computed from tokens by a shared function | 64 |
| Distinct tokens | ~190 |
| Shared roles among them | ~21 |

So ~170 of the ~190 are per-game. They are not 170 different colours in any
meaningful sense: pure blue alone arrives six times under six names, Flood's and
Guess's ten values are identical, and a dozen greens sit within a hair of each
other.

### The constraint that sets the number

Not taste — **Flood, Guess and Samegame need ten members a player can tell
apart**, in both schemes. Everything else the collection does needs far fewer.
So the palette's chromatic half is sized by "ten distinguishable hues", and the
question "how many colours should there be" has a real answer rather than a
preference.

That is also why this change fixes the measured defect its predecessor could
only report. `scripts/colour-dark-check.test.ts` puts Flood's and Guess's worst
dark pair at **0.070 against 0.134 in light**, and no per-game authoring can do
better than patch it, because mutual distinguishability is a property of *the
set*. Design the set once and every game that draws from it inherits the result.

## Decisions

### D1 — Two layers: named colours, and meanings defined over them

```
YELLOW        a colour, named truthfully, with a value per scheme
ERROR = RED   a meaning, resolving to a colour
```

A game references **the meaning**: `out[COL_ERROR] = ERROR`. It references a
named colour only where the colour *is* the meaning — a member of an enumerated
set, or a colour the game names to the player.

Two layers rather than one because the two answer different questions. "What
should an error look like" is a design decision that should be made once and
followed everywhere; "which ten colours are mutually distinguishable" is a
different decision, and collapsing them would mean re-deriving the second every
time the first changes.

### D2 — A named reference must be **true**, and that is what makes it legitimate

Flood's hint says *"Fill with yellow"*. That sentence is a claim, and the hint
quality bar says every sentence a hint utters is a claim that must be checked. So
`YELLOW` must be yellow — recognisably, in light **and** dark — and a scheme may
change its shade but not its hue.

This is the whole justification for a game naming a colour at all. Where the name
is not load-bearing, the game should be referencing a meaning instead; where it
is, the palette owes the player a truthful name. It also resolves a question
`colour-tokens-per-scheme` had to leave open: under dark-mode inversion Flood's
"yellow" currently lands as a dark olive and its "light green" comes out darker
than its "green". Under a designed palette that simply does not arise, because
`YELLOW` and `LIME` are authored in both schemes rather than derived by inverting
a light value.

### D3 — Intensity is one axis, not a licence

Some meanings need the same colour at a different strength: a hint *mark* wants
to be saturated, a hint *fill behind a digit* must be pale enough for black text
on top (this is real — Towers' renderer comments on the blue-on-blue hazard, and
it is why `HINT_ACTION` and `HINT_FILL` are two roles today).

So a named colour is available at a small, fixed number of intensities, and the
number is part of the design rather than something that grows per demand.
**Start at two — a solid and a wash — and add a third only against a case that
cannot be served by the two.** Counting colours by hue keeps the palette at
~10–20; letting intensities multiply unchecked is how 190 happened.

### D4 — What stays derived

Unchanged from `colour-tokens-per-scheme` D2, and not re-litigated: the
`mkhighlight` bevel trio, and the colours defined *relative to the board* (a
pencil mark, a highlight wash, a ruled-out edge). These have no value to author —
they are functions, and they must stay functions because `puzzle-view.ts` hands a
game pure white in dark mode. Consolidation applies to the ~170 absolute tokens.

### D5 — Colours move, and the artefact is the inventory, not a no-op diff

The predecessor's review property was *zero values changed*; this change's is the
opposite, and pretending otherwise would hide exactly what wants reviewing.
Regenerate `inventory.md` after each batch and read it as a **before/after of what
each colour became** — that is the reviewable artefact. Render snapshots will
move; review each as a diff before re-baselining, never a blind `vitest -u`.

The two properties that must *not* move, and are worth stating because everything
else is expected to:

- **no game gains a colour value** — the source guard from
  `colour-tokens-per-scheme` stays green throughout;
- **no game becomes harder to read** — a board whose pieces were distinguishable
  must stay so. The pairwise metric covers the enumerated sets; the rest is the
  browser pass.

### D6 — Order the work by what pins the palette down

1. **Design the palette** against the hardest constraint first — ten mutually
   distinguishable members, in both schemes, verified with
   `colour-dark-check.test.ts`'s metric rather than by eye. Everything else fits
   around a set that already works.
2. **Define the semantic roles over it.** Mostly renaming what
   `palette.ts` already holds, now as references rather than values.
3. **Collapse the enumerated sets** — flood, guess, samegame, map, mines,
   signpost. Six games, most of the token count, and the measured defect.
4. **Collapse the remaining per-game tokens**, game by game, each one either a
   meaning, a named colour, or an argued exception.
5. **Delete what is left of `palette-games.ts`**, or reduce it to the exceptions.

### D7 — An exception is written down or it does not exist

Some game will want a colour the palette does not have. The rule is the audit's:
say what it means to the player and why no existing meaning or named colour
serves. An exception with a reason is fine; the failure mode is thirty of them,
which is how the collection got here.

## Findings — what implementation changed about the above

Recorded because each was a decision the design got wrong or left open, and the
reasoning is worth more than the outcome.

### F1 — Brown is not a hue, and that is why it is a name

D1 assumed the palette's chromatic half was a set of hues. Measured, orange and
brown at the wash and bold steps are **0.01 apart**: brown *is* dark, low-chroma
orange, so it costs no hue. But it could not simply *be* orange's bold step,
because the bold step goes **light** in dark mode (that is what bold means — the
emphatic end, which on a dark board is the light end), and a light brown is not
brown. Flood names it to the player, so D2 applies: it is its own name, with its
own value per scheme, like a piece's black.

### F2 — An intensity may not be named for its appearance

The obvious names were `_PALE` and `_DEEP`. Both are lies in one of the two
schemes: a fill that content is drawn *on top of* must be light under a light
scheme and **dark** under a dark one, or the content stops being readable. D2 says
a name that reaches a player must be true in every scheme — so the steps are named
for their **role**, `_WASH` and `_BOLD`, and the ten-set Flood narrates is built
only from names that survive the flip.

### F3 — The third intensity was forced, and by Mines

D3 said start at two and add a third only against a case the two cannot serve.
**Mines is that case.** Its count digits are 1-blue against 4-navy and 3-red
against 5-maroon — pairs that must be told apart *as digits*, and a wash is a
fill, not a digit. Nothing else in the collection forced a fourth.

### F4 — `HINT_EVIDENCE` changed hue rather than becoming a third blue

D3 anticipated the hint vocabulary wanting three steps of one colour. It does not:
seven games paint an evidence region and a target cell at once, and as two blues
**eight hundredths of a lightness apart** they were all but the same colour. The
distinction the player needs — *this is what I am reasoning from, that is what I
am concluding* — survives a hue change and did not survive a shade change. Evidence
is `TEAL_WASH`; the third step stayed unspent for Mines (F3).

### F5 — Crossing's matched pair dissolved into the palette, and immediately proved why

D7 listed Crossing's OKLCH-matched dimension pair as an exception candidate. It is
not an exception: it is a **constraint on the palette**, and blue's and orange's
wash and bold steps are now tied in lightness *and* chroma, in both schemes, with
blue held down to what orange's narrower gamut can reach.

Worth recording that the first cut tied the **wash** pair and not the **bold**
pair, and Crossing's own `paints the two dimensions at equal perceived strength`
test caught it — which is the argument for having moved the constraint into the
palette rather than leaving it as a game's private discipline.

### F6 — `errorWash` graduated out of D4

D4 said colours defined relative to the board stay functions. One was a function
only because a wash had to track the board *before* the wash step existed, and —
being handed pure white in dark mode — it could not. `ERROR_WASH = RED_WASH` now
authors both schemes. The general rule: a colour that is genuinely absolute wants
to be a *named* colour, precisely because a named colour authors both schemes
where a derivation handed pure white cannot.

### F7 — Map's earth tones went, and the measurement is why

The Risks section flags them as deliberate, and they were: four saturated hues
over a whole board are unpleasant to look at for the length of a game. But they
measured **0.077**, the worst set in the collection, in a game whose entire point
is telling neighbouring regions apart. The wash step answers the original concern
(these are fills, and fills are what the step is for) at 0.115 light / 0.123 dark.
Mosaic's teal, by contrast, survived intact — its identity was a *hue*, and a hue
is exactly what the palette has.

### F8 — A retired override is one that started fighting an authored value

D5 did not say how to tell an absorbed `paletteOverrides` entry from a live one.
The test is mechanical: an override aimed at an index that now carries an
**authored** dark value is no longer correcting a calculation, it is overriding a
decision. Four of the thirteen were (boats' water, bricks' brick, mosaic's unmarked
tiles, tents' grass); the other nine patch a derived colour or the host background,
which is a per-board judgement the palette cannot make.

### F9 — The failure mode of a consolidation is a *collision*, and it needs its own instrument

Nothing in the review plan looked for two meanings landing on one colour, and
`scripts/colour-collide.test.ts` was written after the fact because one did:
Subsets' keyboard cursor, its hint's decided slot and its hint's "could still go
here" spotlight all resolved to blue, collapsing a three-part deduction the game
had deliberately given three colours. Fixed — cursor `PURPLE`, spotlight `GREEN`
— and the instrument stays, because this is the failure mode of *any* pass that
replaces many colours with few.

It cannot be a gate: **most duplicates are correct** (one ink for a game's givens
and its grid, one red for its four kinds of error — 170 such pairs, all
deliberate). Its value is as a **before/after diff**, like `inventory.md`, so a
pair that newly appears is a pair that just collapsed. It names pairs by the
game's own `COL_*` constants, because "subsets 8 vs 11" is not a finding and
"`COL_CURSOR` = `COL_HINT_SPOT`" is.

A second candidate was checked and **kept**: Salad's guessed ball and guessed
hole now share one green, where upstream had two near-identical dark greens. The
report is what makes the case, by putting the new pair directly under the
pre-existing `COL_I_BALL` = `COL_I_HOLE` — the *given* ball and hole have always
shared one ink, so the guessed pair sharing one green mirrors the structure the
game already had.

## Risks

- **A 57-game appearance change.** Mitigated by D6's ordering (the palette is
  proven on the hardest case before anything else adopts it), by the inventory as
  a before/after artefact, and by owner acceptance on the appearance itself — this
  change cannot be signed off by a green suite, and its predecessor's lesson is
  that a green suite is not parity.
- **Losing a game's identity.** Mosaic's teal board, Map's muted earth tones and
  Crossing's OKLCH-matched dimension pair are deliberate, and a palette that
  flattens them into stock hues is worse than the sprawl. Each is a D7 exception
  candidate; decide them explicitly rather than by default.
- **Intensity creep.** D3's two-step rule is the guard, and it needs enforcing at
  review time — "just one more shade" is how a 15-colour palette becomes a
  40-colour one.
- **The named-colour escape hatch swallowing the semantic layer.** If a game can
  always write `BLUE`, it will, and the meanings stop being used. The rule in D2 —
  a named reference is legitimate only where the *name* is load-bearing to the
  player — is what keeps that from happening, and it is checkable at review.
