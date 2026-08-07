# Game mechanics and affordances

How a game's *mechanism* is expressed here: params, descriptions, state, moves,
status, capability hooks, and the player affordances this fork adds on top of
upstream's model. The authoritative contract is
[`src/engine/game.ts`](../../src/engine/game.ts) — its doc comments are
normative-adjacent and kept current; this guide is the tour with the traps
marked. Normative requirements live in the
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) spec.

Sibling guides: [input](./input.md) · [rendering](./rendering.md) ·
[solver & generator](./solver-and-generator.md) · [hints](./hints.md) ·
[testing](./testing.md) · [engine catalogue](./engine-catalog.md). Exemplar to
read end-to-end: [`src/games/galaxies/`](../../src/games/galaxies/).

## The Game contract at a glance

A game is one object implementing
`Game<Params, State, Move, Ui, DrawState, Mistake>`
([`game.ts`](../../src/engine/game.ts)): immutable state transitions, GC
instead of `dup`/`free`, discriminated unions instead of integer sentinels. A
game depends on this interface only — never on the `Midend` — so the interface
is the sole seam between a game and the engine. **An absent optional member
means "this game does not have that capability"** — that is correct behaviour,
not a stub: a game with no solver omits `solve`, a permutation game with no
notion of a wrong-but-legal position omits `findMistakes`.

The five type parameters are yours to shape idiomatically; the file layout that
has held across all 57 games is `index.ts` (the `Game` object + glue),
`state.ts` (types + codecs), `solver.ts`, `generator.ts`, `render.ts` — see
[README](./README.md) § "File anatomy".

## Idiomatic state, not a C transliteration

**Use upstream's C (in git history) as a reference for the logic, never as a
control-flow template.** Classes over handle-passing, iterators over
`while (next())`, `boolean` and unions over `0|1`, modern containers over
C-array mirrors. The bar and rationale live in
[`AGENTS.md`](../../AGENTS.md) § "TS port style"; the payoff is measured
(Galaxies: ~3,000 idiomatic lines against ~4,500 in C, smaller *and* more
readable).

**Watch for logic that is correct only because of what `memmove` leaves
behind.** C's `memmove` copies without clearing the source, so code that opens
a gap in an array may quietly read the "moved-away" values back out of the
vacated slots. A JS `splice`/`concat` destroys those leftovers, and the bug
surfaces only on the narrow case that read them (Inertia's tour splice failed
on the round-trip-out-of-one-vertex case only). The narrow fix is capturing
values before the splice; the real fix is building the new array out of the
pieces you mean (`[...before, ...detour, ...after]`), which makes the bug
unwritable. Exemplar: [`inertia/solver.ts`](../../src/games/inertia/solver.ts)
(`spliceDetour`). **Tell:** any transcribed in-place array surgery — an
overlapping `memmove`, a buffer read past its logical end.

**Share the parts of state that never change — by reference, typed
`readonly`.** A component fixed at `newState` (Flip's matrix, Netslide's
barrier grid) is shared across every cloned state so a move copies only what
moves. `Object.freeze` **throws** on a populated typed array, so the `readonly`
type is the whole guarantee — don't reach for a runtime freeze, and don't
downgrade to a plain `Array` to get one; just don't write to it. Exemplar:
[`netslide/state.ts`](../../src/games/netslide/state.ts).

## Params

### Codecs and validation

`encodeParams(p, full)` / `decodeParams(s)` / `validateParams(p, full)` are the
game-ID surface: `params:desc` and `params#seed` ids are built from them, so an
encoding is **frozen into shared ids** — changing one changes which boards
every existing link names. Decode leniently (garbage in a param string is user
input), validate with a human-readable reason (`null` = valid). For a leading
`WxH` prefix reach for `parseDimensions`
([engine catalogue](./engine-catalog.md) § "params.ts — param-string decoding + config helpers") rather than
hand-slicing.

### Float params round-trip through %g

**A `float` param must reproduce C's `%g`, `atof`, and single precision — all
three change the *board*, not the label.** Netslide places
`(int)(barrier_probability × candidateCount)` barriers, so one ulp is one wall.
Three rules: encode with a `formatG` (six significant digits, trailing zeros
stripped — `String(x)` renders 1/3 as sixteen digits and changes what decodes
back); decode with `atof` semantics (garbage → **0**, which bounds checks then
reject — `Number.parseFloat` yields `NaN`, which slips past every `<`/`>`
check); and store what C stores by `Math.fround`-ing at every boundary that
admits a value. `formatG`/`atof` live in
[`engine/params.ts`](../../src/engine/params.ts); exemplar
[`netslide/state.ts`](../../src/games/netslide/state.ts).

### Presets

`presets()` returns the preset/difficulty menu tree; `defaultParams()` the
start-up choice. Presets must encode **full** params (including difficulty) —
the midend derives the type-menu label and the `#seed` id from
`encodeParams(_, true)`, and a preset that omits the suffix shows the default
difficulty in the header even though the board generated correctly. If a new
game's header ignores a suffix, check that first (it cost a dev-verify cycle
before the fix landed in `Midend.emitIdChange`).

### The type-menu summary

**A game whose params aren't plain `w`/`h` must make `describeParams` emit the
exact keys its `augmentation.ts` template reads — or the header shows the
literal `{field}` text.** The config-summary formatter substitutes `{field}` →
`String(values[field])` and `{field:A|B|C}` → the option at the *numeric*
index; a missing key is left verbatim. Keys are the C config-name slug
(`"Grid size"` → `grid-size`), choice values are zero-based indices, never
label strings. The worker adapter's generic `{ width, height }` base covers
only `w`/`h` games; square-grid and oddly-named-param games (Towers, Keen,
Solo, Unequal) supply their own. A permanent guard exists —
[`augmentation.test.ts`](../../src/puzzle/augmentation.test.ts) fails on any
unsubstituted `{field}` for any registered game.

### The Custom dialog

**The editable "Custom type…" form is `Game.paramConfig` — declarative, like
`prefs` but over `Params`.** An ordered `ParamConfigItem<Params>[]`; the midend
builds the app's form from it and parses a submission back onto a **copy** of
the params, validated by the game's own `validateParams`, so the dialog rejects
exactly what a game ID would. It is independent of `describeParams` (the menu
label). A game that omits it ships a blank Custom dialog — wire it or your
game has no custom sizes. Conventions that keep it correct:

- **Keys match the C config slug**, so the form is stable across eras; `get`
  mirrors `describeParams` (index for a choice, string for a numeric field),
  `set` is its inverse.
- **Numeric `set` goes through `parseConfigInt`, never `Number.parseInt`** —
  atoi semantics turn garbage into 0, which `validateParams` rejects with its
  message; `NaN` slips every bound check.
- **Never hand-write the width/height pair.** Every two-dimension game calls
  `dimensionParamConfig()` ([`engine/params.ts`](../../src/engine/params.ts));
  a game that spells its fields differently passes the field map
  (`{ w: "w2", h: "h2" }`) rather than being renamed to fit — a game contorted
  to satisfy a shared contract is the failure the refactoring guardrails exist
  to prevent. Square games supply a single size item instead.
- **Cross-field folds run in array order** — the midend applies each `set` in
  sequence, so Solo's jigsaw fold (`c *= r; r = 1`) comes after its column/row
  items.
- **The round-trip guard has known blind spots.** `custom-params.test.ts`
  drives every registered game's presets through `get`∘`set` and asserts
  identity — which catches a wrong inverse for free but *not* a wrong label or
  choice list (eyeball those), and is **blind to a swapped field map**, because
  `get` and `set` name the same field either way. A game passing a field map
  asserts the mapping directly, where the fact lives (see the "drives w2/h2"
  test in [`unruly.test.ts`](../../src/games/unruly/unruly.test.ts)). The
  general lesson: *a test whose only observer is the thing under test cannot
  establish ground truth.*

Exemplars: [`pattern/index.ts`](../../src/games/pattern/index.ts) (pure w/h),
[`towers/index.ts`](../../src/games/towers/index.ts) (size + difficulty),
[`solo/index.ts`](../../src/games/solo/index.ts) (the jigsaw fold).

### Difficulty is a declared contract

**A tiered game declares `Game.difficulty`
([`engine/difficulty.ts`](../../src/engine/difficulty.ts)): its tier names, a
`tierOf`/`withTier` accessor pair, and a capped solve.** The point is that
properties *about* tiers — above all cap-monotonicity, whose absence silently
broke Check & Save on every Boats Easy board — are asserted for all tiered
games at once by `difficulty-contract.test.ts`; declaring the contract enrols
the game in those guards automatically. The accessors exist because eight
games type their difficulty as a string union or enum, so no cross-game caller
can write `{ ...p, diff: cap }`. Tier names must match the game's own
`paramConfig` choices (not its `DIFF_*` constants, which mix rungs with solver
verdicts). What a tier *means*, and the grading that enforces it, is
[solver & generator](./solver-and-generator.md) § "A tier means exactly its rung".

## Descriptions and state

`newDesc(p, rng)` generates a board (see
[solver & generator](./solver-and-generator.md)); `validateDesc` rejects a
malformed desc with a reason (it guards the game-ID surface — descs arrive
from URLs); `newState` builds state 0 from a validated desc. The desc codec is
frozen into shared ids, same as params. State is **immutable**: `executeMove`
returns a new state and `cloneState` is cheap by construction (parallel typed
arrays clone well; see Galaxies'
[`state.ts`](../../src/games/galaxies/state.ts)).

## Moves

### interpretMove and UI_UPDATE

`interpretMove(state, ui, ds, point, button)` translates one input event into a
`Move`, `null` ("nothing happened"), or `UI_UPDATE` ("UI/cursor changed in
place; redraw, no history entry"). **Suppress no-op moves locally here — never
by comparing states.** Every game upstream suppresses no-ops in
`interpret_move` (out-of-grid, gutter, already-in-that-state); no game in the
entire C tree ever compared stringified states for undo, and a port that
reaches for `Object.is`/deep-compare is re-deriving a mechanism that does not
exist. The shared predicate that decides "would this change anything?" should
be the same one `executeMove` filters with, so the two cannot drift (see
[input](./input.md) § "A line-fill drag picks a transformation" for the Boats
worked example). Input-device traps — touch, stylus, keypad, drag classes —
are [input](./input.md)'s whole subject; read it before writing this hook.

### executeMove is pure

`executeMove(state, move)` returns a **new** state and throws on an illegal
move. Purity is load-bearing three ways: saves replay the move log through it
(never through `interpretMove`), hints simulate with it, and the desc-supersede
pull below depends on it. The one sanctioned impurity in the collection is
Mines' shared mine-layout box (below), commented at the mutation site.

### Moves are discriminated unions

A move is a typed discriminated union the compiler covers exhaustively — not a
`sscanf` string. (Galaxies' 140-line C `execute_move` with `goto badmove`
became a union the type-checker fully covers.) For the save file a move must be
structured-clone-safe as-is, or the game supplies `serialiseMove`/
`deserialiseMove`.

## Status

`status(state)` reports won/ongoing/lost. **Solve must complete the game**:
the solve move's `executeMove` arm runs the completion check (so the game
reports solved-with-help) and sets `cheated` (so the win flash doesn't fire on
a solver fill). Where upstream forgot that bookkeeping, fix it — that class of
quirk is missing bookkeeping, not behaviour (owner directive, 2026-07-21;
exemplar divergence comment in
[`subsets/index.ts`](../../src/games/subsets/index.ts)). The solver side of
Solve is [solver & generator](./solver-and-generator.md) § "Solve and the generator's aux".

## Capability flags

| Flag | Means | Trap |
| --- | --- | --- |
| `wantsStatusbar` | game writes `statusbarText` | timed games get a `[M:SS]` prefix engine-side |
| `isTimed` | midend runs the clock while `timingState(state, ui)` is true | browser-verify the tick/freeze/resume — see "Timed games" |
| `canSolve` | `solve` present | test through a real `Midend` when `aux` matters |
| `canFormatAsText` | `textFormat` present | may still return `undefined` for params with no rendering (Loopy: square grid only) |
| `canMarkAll` | game handles the `M`/`m` key; shell shows the button | see "Pencil marks" |
| `needsRightButton` | game is unplayable without a secondary action | drives the touch affordance — [input](./input.md) |
| `wantsStylusModifier` | game handles `MOD_STYLUS` itself | **keep false** unless touch has its own behaviour; the midend strips the bit for everyone else — [input](./input.md) § "Touch is stripped for you" |

**A param-dependent capability the static flag can't express: widen the
return, don't add a hook.** Loopy's text format works on the square lattice
and none of its other seventeen tilings; the resolution was widening
`textFormat` to return `string | undefined` — the midend and share dialog
already treat an absent rendering as "no text panel". A
`canFormatAsTextNow?(params)` hook would have been a wider surface for one
adopter, which is the `PointerAction` mistake: a hook shipped speculatively,
adopted by nobody, later deleted as phantom API. When one game needs a
refinement, prefer the narrowest change the existing consumers already
tolerate.

## Ui

`Ui` is the ephemeral interaction state (cursor, drag anchors, typing buffers,
preferences) — never persisted with the board, rebuilt by `newUi` and move-log
replay on load. Entry-method state lives here, not on `State`, however many
gestures feed it (Ascent's three entry methods plus path drawing all collapse
to one small `Ui` + a four-armed move union).

### changedState

`changedState(ui, oldState, newState)` reconciles a `Ui` that tracks state
after every real move/undo/redo/solve/restart (never on a bare `UI_UPDATE` —
the user is mid-edit then). **A drag-preview game must cancel a dangling drag
here**: the board can change under a held pointer (toolbar undo mid-drag), and
a preview that then simulates its move against the new board throws where
upstream asserted. See [rendering](./rendering.md) § "Drag previews and blitters" for the
render half.

### Ui that must survive a save

**A `Ui` field set in `interpretMove` that lives outside the undo history
cannot be rebuilt by replay** — replay runs `executeMove`, never
`interpretMove`. Mines' death counter is the case: dying then undoing removes
the death from the log. Serialise exactly those fields with
`encodeUi`/`decodeUi`; the midend restores them after the replay. A game whose
`Ui` is fully derivable omits both hooks — that is every game but Mines today.

### Preferences

**Per-game preferences are the declarative `Game.prefs` hook; the values live
on the `Ui`.** Each item maps a labelled boolean/choices control to
`get(ui)`/`set(ui, v)` accessors; `newUi` sets the defaults (the place to ship
a deliberate divergence — Untangle's crossed-edge highlight defaults on). The
midend builds the dialog, persists per-puzzle, and re-applies choices after
every `newUi`. Choice values are zero-based indices; booleans are real
booleans. Two verify-cycle gotchas:

- A render-only pref moves nothing a game's redraw early-out watches, so the
  midend drops the drawstate on `setPreferences` to force a full repaint —
  expect the full repaint, add nothing.
- **The app overrides `newUi` defaults per-puzzle**:
  `src/store/settings.ts` `getPuzzlePreferences` carries a small hardcoded
  defaults map applied on every load. A checkbox that comes up "wrong" on a
  smoke-test may be the app's intended default — check that map before chasing
  your hook.

Exemplar: [`untangle/index.ts`](../../src/games/untangle/index.ts). Pencil
games declare the shared prefs from
[`engine/pencil-prefs.ts`](../../src/engine/pencil-prefs.ts) — see below.

## Timed games

`isTimed: true` + `timingState(state, ui)`: the midend runs the clock while
the predicate holds and prefixes the status bar engine-side; your
`statusbarText` returns only the game text. Mines stops the clock before the
first click, on death, on a win, and for ever once `ui.completed` was set.
**Browser-verify a timed game** — watch the clock tick, freeze and resume; the
timer path is real-frontend behaviour no unit tier exercises.

## A board decided at first click

**A game whose board isn't determined until play begins implements
`supersededDesc(state)`** — the engine *pulls* a replacement desc after every
committed move, so `executeMove` stays pure and no game holds a midend
back-reference. Mines generates its layout on the first click (which is
therefore never a mine). The engine guarantees, so don't re-derive them
(normative: [`ts-engine`](../../openspec/specs/ts-engine/spec.md), "A game can
supersede its game description mid-play"):

- `null` means "nothing to say" — **never** "revert". Undoing past the
  generating move keeps the desc: a desc describes the *game*, not the
  position.
- `privDesc` is what a *save* rebuilds state 0 from, when the public desc
  bakes in the generating move (Mines' public desc names layout *and* first
  click; replaying the log from it would re-play a click already baked in).
- Restart rebuilds from the *public* desc — the player restarts to just after
  the generating move, not to a blank board.

Make generation a deterministic function of state + move (the desc RNG rides
in the state) or the move log will not replay. Keep it in **one controlled
shared box**: Mines' layout is a mutable holder shared by reference across
every cloned state, filled once, surviving undo — the sole deliberate
`executeMove` impurity, commented at the mutation site as the memoisation it
is. Exemplars: [`mines/index.ts`](../../src/games/mines/index.ts) +
[`mines/state.ts`](../../src/games/mines/state.ts) (`MineLayout`);
[`desc-supersede.test.ts`](../../src/engine/desc-supersede.test.ts) is the
shape in miniature.

## Affordances

The deliberate-divergence features every game is measured against. Each is an
optional `Game` hook; presence drives the shell's controls automatically
through `Midend.getStaticProperties`.

| Affordance | Hook | Guide |
| --- | --- | --- |
| Explained hints | `hint` (+ plan hooks) | [hints](./hints.md) — **every game is expected to ship one** (coverage incomplete; see that guide's opening) |
| Mistake checking | `findMistakes` | computing: [solver & generator](./solver-and-generator.md); rendering: [rendering](./rendering.md) § "Overlay sidecars" |
| Quick-save / Check & Save | free once `findMistakes` exists | shell-owned |
| Pencil marks | `canMarkAll` + moves + prefs | below |
| Reference aid | `reference`/`selectReference` | below |

### Mistake checking is part of "done"

**A game with a unique solution MUST ship `findMistakes` — Check & Save
depends on it.** The shell hard-blocks a bad save only when `canFindMistakes`
is true, which is exactly `game.findMistakes !== undefined`; without it the
control silently degrades to a plain quick-save and **blesses a wrong board**
(shipped in Unruly's first cut, caught on owner smoke-test). The four
computation shapes (re-solve, edge-contradiction, both-layers, rule-checker)
are [solver & generator](./solver-and-generator.md) § "findMistakes";
the overlay-repaint trap is [rendering](./rendering.md) § "Overlay sidecars";
the refusal-to-hint coupling is [hints](./hints.md) § "Refusal couples to the
mistake overlay".

### Pencil marks: the full note-taking UX

Any game with candidate pencil marks carries all of the following — deliberate
default-on divergences that make note-taking usable with mouse and touch, not
just keyboard. Exemplar: [`towers/index.ts`](../../src/games/towers/index.ts).

- **Mark-all — `canMarkAll: true`.** The game handles `M`/`m` in
  `interpretMove`; the flag surfaces the toolbar button that injects it.
  A *candidate-elimination* game (one with a `regionsOf` — see
  [hints](./hints.md) § "Candidate-elimination games") routes `M` through
  `adaptiveMarkAllMove`
  ([`engine/candidate-hint.ts`](../../src/engine/candidate-hint.ts)): fill
  note-less empty cells, or — on an already-fully-noted board — strike each
  cell's *obvious* candidates (values already placed in one of its uniqueness
  regions) as one atomic move. It returns `null` when there is nothing to do,
  so a redundant press adds no undo entry. The cleanup is idempotent, defined
  off the *placed* grid only, and never empties a cell's last note. Use the
  same `regionsOf` the hint uses (a Keen cage is **not** a uniqueness region);
  games without a row/column model keep plain fill-only. **The mark-all trap:**
  a guard on this path must *narrow* a cell's notes or the bug hides — the
  mark-all-resets-notes defect shipped in ten games at once; mutation-check
  the guard (see [testing](./testing.md)).
- **Declare the pencil preferences from
  [`engine/pencil-prefs.ts`](../../src/engine/pencil-prefs.ts), never by
  hand.** `stickyPencilPref()` and `pencilKeepHighlightPref()` carry wording
  ten and five games share; `autoPencilPref(name)` takes its label as an
  argument *because* the sentence names the regions the game clears. Sharing
  only the keyword and plumbing is the honest amount to share — a copied
  player-visible label is a label that drifts, and `pencil-prefs.test.ts`
  fails on a divergent copy.
- **Sticky pencil mode** — a `pencilSticky` `Ui` boolean (default true) via
  `prefs`: right-click toggles a persistent pencil mode; left-click only moves
  the highlight. The keyboard is already mode-persistent; this unifies the
  mouse with it. A right-click on a filled/given cell toggles the mode but
  must **not** select or restyle that cell — it can't take a mark, so
  highlighting it only confuses.
- **A CapsLock-style mode indicator** — a fixed pencil glyph whenever the mode
  is on. Placement is a rendering problem with three known answers (cache-safe
  cell bit, explicit end-of-redraw repaint, or grow the canvas below the board
  when every cell is spoken for — Mathrax); see
  [engine catalog](./engine-catalog.md) § "pencil-indicator.ts — the
  pencil-mode glyph".
- **Notes are first-class in `findMistakes`.** An empty cell whose non-empty
  notes have crossed out the solution value is a mistake (`kind: "note"`),
  rendered like a wrong placement and blocking Check & Save through the
  existing gate. Extra, non-solution candidates are ordinary mid-solve state —
  not flagged. Derive the solution from placed givens only, never from notes
  (a note can be wrong; that is what is being checked). Normative: the
  `findMistakes` requirement in
  [`ts-engine`](../../openspec/specs/ts-engine/spec.md). **Carve-out:** this
  holds only where notes *are* candidates. Rome's marks are documented as
  free-purpose (a player as likely marks what they ruled out), so with no
  agreed meaning no reading of a note can be called wrong — Rome checks placed
  arrows only. Read the game's help page before applying the rule; record a
  decline in the change's `design.md`.

The explained pencil-notes hint these games want is its own change — see
[hints](./hints.md) § "Candidate-elimination games".

### The reference aid

**A game whose core bookkeeping is "which pieces have I used?" can offer a
reference aid** — a non-blocking checklist panel of the fixed piece inventory
with found status, where clicking a piece spotlights its candidate placements.
A deliberate learning-aid divergence, gated behind a toolbar button like
Solve. The seam is generic (Dominosa implements it today):

- **Two optional hooks.** `reference(state, ui): ReferenceModel` returns the
  checklist, derived **purely from the player's own placements**, never the
  solution — zero leak; it is the paper accounting. `selectReference(ui, key)`
  spotlights by mutating `Ui` and reports whether anything changed (false
  skips the repaint). It is the first clean app→`Ui` push channel — shaped
  like a `UI_UPDATE`, no move, no history, not serialised.
- **Presence flows the `canMarkAll` chain** (`hasReference` →
  `PuzzleStaticAttributes` → toolbar + menu). The panel is the generic
  [`components/reference-panel.ts`](../../src/components/reference-panel.ts):
  side-docked with room, a bottom sheet on narrow viewports *and* in the
  short-landscape orientation (a side dock there shoves the board off-centre —
  the panel and the padding rule share the orientation media condition).
- **The board highlight is a per-game `Ui` field + render bit** (Dominosa's
  `highlightPair` drives `COL_REFERENCE` boxes; the bit folds into the packed
  cache key — [rendering](./rendering.md) § "The tile cache and the diff key"). Drive the frame
  in-process with `renderScenario({ …, selectReference: key })` and assert the
  boxes appear only with a selection.

Normative: the reference-aid requirement in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md); exemplar
[`dominosa/`](../../src/games/dominosa/index.ts).

**When the inventory is already drawn on the board, make it an input surface
instead of a panel.** Crossing's clue list was already painted, so the port
made it clickable — pick a clue up, see it ghosted into every run that can
still take it, click to write it in as one move. No new engine seam: it is
`interpretMove` hit-testing pixels the game paints. Two rules make it safe:
share the layout function between `redraw` and `interpretMove` (a private copy
in the input path is a drift bug waiting to happen — see "One function, both
callers" below), and decide what "available" means *short of solving* —
Crossing offers a clue on length/digit/unused pattern-matching over the
player's own entries; testing crossing-run satisfiability is constraint
propagation, i.e. the puzzle, and belongs to `hint()`. The stronger version is
barely more code, which is exactly why the line needs stating.

**Check what a gesture already means before borrowing an interaction from
another game.** Ascent's ghost grammar (left accepts a preview, right cycles
alternatives) does not transplant to Crossing, where both gestures were
already spent — the visible inventory replaced cycling altogether.

## Bespoke geometry

### Padded rectangles and sheared draws

Some games store an odd-shaped board in a padded rectangle and shear it on
draw (Bricks: a hexagon whose backing array is wider than the user size, the
two triangular corners masked to a bound sentinel, each row drawn offset by
half a tile per row). Three rules keep it cheap and correct:

- **The mask + neighbour table are logic, not display.** They decide how many
  playable cells the desc encodes and drive validity — a bug there desyncs the
  codec and the solver. Everything visual (shear offset, bevels, origin) is
  display: match the look, keep it clean.
- **`interpretMove` must invert the exact draw transform, in the same
  order** — undo the origin, floor to a row, *then* subtract that row's shear
  before flooring to a column. Share the offset helper between `render.ts` and
  `index.ts` (Bricks exports `offsets(h, ts)`) so pointer mapping and drawing
  cannot drift. Force the tile size even in **both** `computeSize` and
  `setTileSize` so the half-tile is exact.
- **Verify the shear from an SVG dump before touching a browser** — a wrong
  offset shows instantly as a staircase; see
  [testing](./testing.md) § "Render scenarios".

Exemplars: [`bricks/render.ts`](../../src/games/bricks/render.ts) +
[`bricks/index.ts`](../../src/games/bricks/index.ts).

### One function, both callers

**Any rule the input and the display both need is one function, called by
both.** Coordinates are only the obvious case. Crossing's clue list *colours*
each clue by which run a click would send it to, and that rule was written
twice — an inline loop in `redraw` and `runForNumber` for the click. They
agreed until the rule gained a tie-break, at which point the list said "down"
while the click placed "across" (owner-reported). The fix is not to fix both
copies but to delete one: `redraw` now asks `runForNumber`. **Tell:** a
predicate in `redraw` that answers what a *move would do* — that belongs to
the move code; render should be asking, not deciding. Exemplar:
[`crossing/render.ts`](../../src/games/crossing/render.ts) (`layoutNumbers`,
`runForNumber`).

### Grid modes are a movement table

**A game with several grid shapes is usually one substrate plus a per-mode
movement table — not N geometries.** Ascent's five modes (rectangle,
no-diagonals, hexagon, honeycomb, edges) are one square-grid substrate with a
`{dircount, dirs}` table per mode; adjacency, the solver, the codec and the
completion check read the table and are otherwise geometry-free. Hexagonal
modes are square grids with wall padding at the border; the half-tile visual
offset is a render concern, so the renderer has no per-mode board code at all.
Keep the *physical* grid size (state) and *user-facing* size (params) explicit
and separate; the physical size is frozen into ids. The table's inverse
structure (`dirs[n]` inverse of `dirs[dircount−1−n]`) is load-bearing for the
solver — port it verbatim.

Two adjacent Ascent patterns worth reaching for:

- **Multi-method entry reduces to a small discriminated move + an ephemeral
  `Ui`.** However many gestures exist, they emit one of a few move arms; the
  entry state lives on `Ui`, never `State`. C `switch` fallthroughs become an
  extracted arm called from the end of the prior case (a literal fallthrough
  trips `noFallthroughCasesInSwitch`).
- **A path-resolution post-pass that iterates.** When a drawn line can force
  placements, `executeMove` runs the clean/update/apply cycle **to a
  fixpoint** after the edit, then the completion check — a single pass misses
  the fully-drawn segment between two known numbers.

Exemplars: [`ascent/state.ts`](../../src/games/ascent/state.ts),
[`ascent/ui.ts`](../../src/games/ascent/ui.ts),
[`ascent/moves.ts`](../../src/games/ascent/moves.ts),
[`ascent/solver.ts`](../../src/games/ascent/solver.ts) (a scratch flag that
persists across solves — a generation-critical quirk; see that change's
design F1).
