# The game definition — what you declare, what you get

> **⚠️ STATUS: design fiction** — describes a system that does not exist.
> Authored by `rewrite-game-dev-docs` (2026-08-07). Current truth:
> [`docs/games/`](../games/README.md). See the [vision README](./README.md).

A framework game is one directory exporting one **definition** — a manifest of
declarations, each of which buys a set of derived behaviour. This document
walks the declarations in the order the scaffolder presents them, and states
for each: what you write, what falls out, and where the escape hatch is.

The running example is **Towers re-expressed** (chosen because it exercises
the Latin substrate, candidate hints, difficulty tiers and pencil UX at once).
Today: ~2,600 lines across seven files. Re-expressed: ~1,100, of which the
techniques and narrations — the parts that are *Towers* — are ~700.

## Params and presets

**You declare:** the params record, its field configs (reusing today's
declarative `paramConfig` shapes), presets, and validation predicates.

**You get:** the Custom dialog, the type-menu summary, param codecs (the
`WxH`-style prefix forms via the shared parser; `%g` float round-tripping),
and — if your techniques carry tiers — the whole difficulty contract:
tier list, read/set on params, capped solving, and enrolment in the
cap-monotonicity and tiers-bind guards. There is no hand-written
`DifficultyContract`; it is a projection of the technique ladder
([`deduction.md`](./deduction.md)).

**Escape hatch:** a bespoke codec for params whose grammar the shared parser
cannot express (Blackbox's `w<W>h<H>m…M…`), with the obligation that encode
and decode are property-tested inverses — a test the framework generates.

## The board model

**You declare:** topology (square / hex / one of the eighteen `grid/` tilings
/ a bespoke coordinate pair), what a cell holds (a finite domain, a candidate
set, a numeric range), and which entities exist (cells, edges, vertices —
Palisade-family games are edge games; Slant is a vertex game).

**You get:** state allocation and structural cloning (immutability by
construction — no game writes `cloneState` again), the desc codec for the
common run-length grammars, coordinate maps used identically by input and
paint (the "one function, both callers" rule made structural), cursor
movement including the half-grid and edge-cursor variants, and bounds/geometry
for `computeSize`.

**Escape hatch:** a bespoke desc codec (obligation: round-trip property test,
generated) and bespoke geometry (obligation: the single shared coordinate
pair, which the conformance suite exercises from both callers). **Existing
games keep their byte-stable codecs permanently** — a shared game ID is a
promise to players ([`migration.md`](./migration.md)).

## Moves and gestures

**You declare:** the move union (typed, discriminated — as today) and a
**gesture table**: pointer gesture → move constructor (click cycles, drag
paints accretively, right-click marks, press-picks-transformation, …), drawn
from a named library of the gesture shapes the collection has already needed.

**You get:** `interpretMove` assembled from the table; **keyboard and touch
equivalents derived by default** — every gesture names its keyboard binding
and its touch rendering (or inherits the library default), which turns the
input-parity bar (owner, 2026-08-03) from an audit obligation into the
resting state. The four frontend traps (stylus stripping, hold-as-right-
button, bare-digit binding, focus return) are handled once, in the library.
Move application (`executeMove`) stays a pure per-game function; local no-op
suppression stays local, as today.

**Escape hatch:** raw `interpretMove` for genuinely bespoke interaction
(Untangle's drag physics, Cube's rolling), with the obligation that every
player-reachable action is still reachable from all three input modes or the
gap is declared (and surfaces in the conformance report, not in silence).

### What has already been lifted, and what is deliberately still waiting

> This subsection is **not** fiction: it records a survey run on 2026-08-26 of
> what input logic could move to shared code *today*, against the criterion
> [`engine/border-grid.ts`](../../src/engine/border-grid.ts) states — not "is
> this the same text" but **"would a change here have to happen in every copy at
> once?"** It is here rather than in `docs/games/` because it is the evidence
> for the gesture table's economics, and because the "declined" half is the part
> a future session most needs, so it is not re-proposed each time.

**Lifted, because each is one *frontend fact* with N restatements** — the class
where a copy is not merely redundant but silently wrong the day the fact moves:

| Fact | Was | Now |
| --- | --- | --- |
| Which codes mean erase / cancel | 14 of 57 games, most of them **dead** (`8`, which this frontend never sends) | `isEraseKey` / `isCancelKey` |
| Which codes are a mouse press / drag / release | 5 games kept private copies after 27 others were consolidated | `isMouseDown` and siblings, now guarded |
| Whether Escape reaches a game at all | swallowed by the shell; three games' cancel arms unreachable | delivered as `27` (`app-shell` spec) |

Guarded by [`emittable-keys.test.ts`](../../src/engine/emittable-keys.test.ts),
which derives both lists from source — `puzzleKeyMap`'s codes and `pointer.ts`'s
exports — so a helper added to the framework is enforced the day it lands. That
is the "contracts are enforced by machines" principle applied to input, and it
is available *without* the framework existing.

**Declined for now, with reasons, because they are not that class:**

- **Digit parsing** (`button >= 49 && button <= 57`, `button - 48`; 11 games).
  Looks identical, is not one fact: `'0'.charCodeAt(0)` cannot drift, and every
  caller differs in the part that matters — the bound (`<= w`, `< n`,
  `<= ncolours`), the offset convention, and whether `0` clears or means ten.
  A shared helper would save a line and leave the decisions untouched. **This is
  a shape for the gesture table to own** (`digits(1..w) → move`), not a helper.
- **Cursor visibility** — the reveal-on-arrow / hide-on-press idiom, in **42 of
  57 games under six different field names** (`hshow`, `cshow`, `curVisible`,
  `cursorVisible`, `cursor`, `displayCur`). This is the collection's largest
  input duplication and the clearest thing the framework should own. It is
  declined *today* because extracting it by hand is a 42-game `Ui` rename with
  no correctness payoff — the idiom is stable, so no copy is at risk of going
  wrong. The win arrives only when the framework assembles `interpretMove` and
  games stop naming the field at all. **Do not do this as a standalone
  refactor**; it is the gesture table's first customer and its best argument.
- **The Latin-family highlight-then-type flow** (Solo, Keen, Towers, Mathrax,
  Unequal, Seismic, Group, Salad). Genuinely similar and genuinely divergent —
  sticky pencil, mark-all semantics, and what a re-press of the held digit does
  differ per game and are *player-visible*. `border-grid.ts` is the precedent
  for how to do this right when it is done: extract the mechanic the player
  operates, leave every game its own move type and its own semantics.

The pattern across all three declines: **a shared helper is right when the thing
shared is a fact, and a framework is right when the thing shared is a shape.**
Helpers were the correct tool for the first table and are the wrong tool for the
second — which is the case for the gesture table, made from measurements rather
than from taste.

## Solving, hinting, generating

**You declare:** the technique ladder (or a planner, or a bespoke loop with
its obligations). **You get:** solve, grade, generate, hint, refuse — see
[`deduction.md`](./deduction.md), which is the heart of the framework.

## Presentation

**You declare:** `tileKey`, `paintTile`, overlays, decorations, animation
lengths, palette meanings. **You get:** the cache loop, the diff key with
every overlay in it by construction, sidecars, flash, sprite scheduling — see
[`presentation.md`](./presentation.md).

## Affordances

Declared capabilities, each buying its whole UX:

- **Pencil marks**: declaring a candidate-set cell domain buys the full
  note-taking contract — mark-all with the resets-notes rule, sticky mode,
  the mode indicator, auto-cleanup prefs, and the hint interplay
  (populate/cleanup steps, `refreshHintStep` for side-effect staleness).
- **Mistakes**: derived or invariant-based ([`deduction.md`](./deduction.md));
  buys Check & Save, the refusal banner, and the overlay.
- **Reference aid**: declare the inventory model; buys the panel, the
  spotlight `UI_UPDATE` wiring, and the hint-suppression dismissal rule.
- **Prefs / timed play / save-surviving Ui / first-click boards
  (`supersededDesc`)**: unchanged from today's declarative hooks, which are
  already the right shape.

## What is left of `index.ts`

Glue shrinks to the definition export plus whatever escape hatches the game
took. The definition is data-plus-functions, so the conformance suite,
the scaffolder, and any future tooling can *introspect* it — no build step,
no generated files (repo doctrine), just a richer runtime object than
today's `Game`.
