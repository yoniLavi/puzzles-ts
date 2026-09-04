# The game definition — what you declare, what you get

> **⚠️ STATUS: design fiction** — describes a system that does not exist.
> Authored by `rewrite-game-dev-docs` (2026-08-07). Current truth:
> [`docs/games/`](../games/README.md). See the [vision README](./README.md).

A framework game is one directory exporting one **definition** — a manifest of
declarations, each of which buys a set of derived behavior. This document
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
tier list, read/set on params, capped solving, and enrollment in the
cap-monotonicity and tiers-bind guards. There is no hand-written
`DifficultyContract`; it is a projection of the technique ladder
([`deduction.md`](./deduction.md)).

> **The tier list has shipped as a projection — of the params form, not the
> ladder** (`derive-difficulty-from-the-technique-ladder`, 2026-09-04). No game
> writes a tier list any more: `difficultyTiers(game)` reads the difficulty
> `paramConfig` item, so a tiered game declares its tiers exactly once, where a
> player picks one. The live contract is
> [`docs/games/mechanics.md`](../games/mechanics.md) § "Difficulty is a declared
> contract"; read that, not this.
>
> **The paragraph above is refuted in its mechanism**, and the `ts-engine` spec
> records why so it is not re-attempted. A ladder declares tier *numbers* while a
> tier list is *names*; `runDeductionFixpoint` **receives** its cap, and every
> ladder in the collection is built inside a solve from board state, so there is
> nothing to project from at module load; and a tier is often not a rung — five
> latin games' top tier is `latinSolverRecurse`, outside the fixpoint. What
> remains fiction is the rest of the sentence: `tierOf`/`withTier` and
> `solveAtCap` are still hand-written per game, and both were checked against the
> corpus and found to be genuinely per-game rather than un-extracted.

**Escape hatch:** a bespoke codec for params whose grammar the shared parser
cannot express (Blackbox's `w<W>h<H>m…M…`), with the obligation that encode
and decode are property-tested inverses — a test the framework generates.

> **The codec has shipped, and the escape hatch's named example was wrong**
> (`declare-params-and-presets`, 2026-09-05). A game declares an ordered
> segment list and gets both halves from `paramsCodec`; segments name a
> `paramConfig` field by its `kw` and reuse that item's accessors, so the form
> and the codec are one field list rather than two. The live contract is
> [`docs/games/mechanics.md`](../games/mechanics.md) § "Codecs and validation";
> read that, not this.
>
> **Blackbox is not an escaper.** Its `w<W>h<H>m…M…` is a tagged segment list
> like every other — it just does not lead with `WxH` — and drawing the grammar
> at segments rather than at "dimensions plus a suffix" takes it in. The shapes
> that genuinely escape are five, named in the `ts-engine` spec: a float param,
> a leading letter before the dimensions, a `switch` over multi-character
> strings, a `while` loop over the tail, and a boolean encoded as an integer.
>
> **The inverse property is asserted, but not "a test the framework
> generates".** It is one derived cross-game guard —
> `params-stability.test.ts` over a registry-derived corpus — which reaches the
> 38 games still writing bespoke codecs too. A per-game generated test would
> have covered only the games that had already adopted, which is the enrollment
> trap `derive-hint-enrollment` exists to avoid.

> **"You get the type-menu summary" has shipped too**
> (`derive-the-type-menu-summary`, 2026-09-05) — and it was the sentence in this
> section that was furthest from true. The summary was hand-written per game,
> with the tier words typed out 24 times, and **19 of the 21 games that named a
> difficulty named one the game does not have.** The live contract is the
> `app-shell` spec, "The type header names an option by the name the game
> declares".
>
> Worth carrying into the rest of this document: the mechanism needed to derive
> it **already existed and was already in flight** — `choicenames` on the
> `ConfigDescription` the Custom dialog is built from — which is why the dialog
> was right the whole time the header was wrong. Twice now (this and the codec
> off `paramConfig`), the declaration a concern should derive from was already
> there and already crossing the boundary. Before designing a new declaration,
> check what the consumer is already being sent.

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

**To abstract, not to leave alone.** An earlier draft of this section declined
the first two below on the grounds that the idiom is stable and unifying it
would be churn without a correctness payoff. **That reasoning is retired** — see
the README, "The order of work". The churn *is* step 1, and the test is not
whether unifying is disruptive but whether we positively believe the concern
should be free to differ between games. For these, we do not:

- **The keyboard cursor's `Ui` contract** — ~~one concept, 42 of 57 games, six
  field names~~ **DONE, and it was worse than surveyed**: fifty games, *ten*
  spellings of the flag and eight of the position, plus two games (Ascent, Rome)
  hiding "is it shown" inside a mode enum. Shipped as
  `unify-cross-game-vocabulary`; the live rules are
  [`docs/games/input.md`](../games/input.md) § "Keyboard cursors" and
  `engine/pointer.ts`'s `GridCursor`. **What the survey got right is worth
  keeping as method**: what genuinely differs (Tents painting while it moves,
  Boats filling a line) reads the position either side of the move and survived
  untouched, and the save-format worry was unfounded for the reason predicted —
  Net's `encodeUi` emits `C<x>,<y>`, so the wire format never knew the field's
  name. What it got *wrong* is instructive too: it assumed the six names were
  the population, and counting them was how four more were missed.
- **Digit parsing** (`button >= 49 && button <= 57`, `button - 48`; 11 games).
  Splits cleanly rather than being declined: *"is this a digit key and which
  digit"* is one fact and belongs in `pointer.ts`; the **bound** (`<= w`,
  `< n`, `<= ncolors`) and whether `0` clears or means ten are real per-game
  answers and stay. The gesture table's `digits(1..w) → move` is the end state;
  the helper is the step that gets there without waiting for it.
- **The Latin-family highlight-then-type flow** (Solo, Keen, Towers, Mathrax,
  Unequal, Seismic, Group, Salad) — the one where the caution still applies, and
  for the right reason rather than the retired one: sticky pencil, mark-all
  semantics and what a re-press of the held digit does are **player-visible**
  and deliberately differ. So the mechanic is shared and the semantics are not,
  exactly as [`border-grid.ts`](../../src/engine/border-grid.ts) did it — extract
  what the player operates, leave every game its own move type and its own
  answers.

**And one found by re-reading the guides for the retired excuse**, which is
worth noting as a method: grepping `docs/games/` for "stays per-game" and
"keeps its own" turned up the same drift a third time, outside input entirely.

- **The completion vocabulary on `State`.** ~~45 games hand-write
  `flashLength`; eight reproduce `winFlash`'s condition verbatim and about six
  more write it against a differently-spelled flag.~~ **DONE** as
  `unify-cross-game-vocabulary`; the live rules are
  [`docs/games/rendering.md`](../games/rendering.md) § "Animation and flash" and
  `engine/flash.ts`, which now lists every game that keeps its own hook with the
  reason. The survey's argument stands and is the reason to do the next one:
  **a framework cannot derive Check & Save, the status bar, the win flash and
  the difficulty contract from a concept each game names differently.**

  Two findings the survey could not have had, both from doing it:
  **Magnets spelled `cheated` as `solved`** — the word Loopy and Undead used for
  `completed`, so one word meant opposite things in three games; and the survey
  counted 14 restatements where there were 25, because it counted *spellings*
  rather than measuring the population.

**The distinction that survives**, and the only one that should be argued from:
*a shared helper is right when the thing shared is a fact; a framework is right
when the thing shared is a shape; and something stays per-game only when we can
say what a game would legitimately want to do differently.* "It would touch a
lot of files" is a measure of how much the abstraction is worth, not an argument
against it.

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
