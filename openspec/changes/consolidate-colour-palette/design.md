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
