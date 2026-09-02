# Design — add-latin-repeats-support

The proposal says what is wanted and why it waited. This records the decisions
the implementation took, so they are not re-derived.

## D1. One repeated symbol, always the last

`LatinSolverConfig.repeats: { times }` tells the cube that its **last** symbol
appears `times` times per line. The cube then has `symbols = o − times + 1`
distinct values, `cubepos` strides by `symbols`, and the repeated symbol is
`symbols` itself. Always-the-last keeps a consumer's real symbols at `1..k` and
puts the repeat one past them, which is exactly Salad's `holeSymbol(nums) =
nums + 1` — the value a solved working grid holds in an empty square, so every
reader's `<= nums` test stays true.

Generalising further (several repeated symbols, arbitrary positions) was priced
and declined: the proposal scopes to "one declared symbol", no second consumer
exists, and a per-symbol multiplicity table would touch every loop in the class
for a case nothing needs. `multiplicity(n)` is the one place the rule lives, so
widening later is local.

**A consumer with exactly one empty per line declares nothing.** `nums =
order − 1` gives `times = 1`, and a once-per-line symbol is just a symbol; the
constructor refuses `times < 2` rather than special-casing it, and Salad's
`repeatsFor` returns `undefined` there.

## D2. Where multiplicity enters, and the inertness proof

| Path | With a repeat | Without one |
|---|---|---|
| `place` | the repeated symbol strikes its line only when the line's count reaches `times` (`repeatFull`) | unchanged: one placement strikes the line (`dup`) |
| `elim` (positional) | places the symbol when exactly `times` cells can take it; `< times` is a contradiction | `need = 1`, the C's logic |
| `diffSimple` | a line is skipped once its count of the symbol is full | the ledger is `0/1`, as before |
| `diffSet` | `setGeneral`: hidden/naked sets with demands and supplies | the C's `set`, byte for byte |
| `forcing` | never starts from or propagates through the repeated symbol | unchanged |
| recursion | loops over `symbols` | `symbols = o` |

Every row's right-hand column is the claim "inert when unused", and it is
verified from outside the module: the ten other `latin.ts` consumers — ABCD,
Ascent, Group, Keen, Mathrax, Singles, Solo, Tents, Towers, Unequal (the
proposal's list named Undead, which does not use the module) — each have a
byte-match differential, and all stayed green unedited, which on a solver-gated
generator means the solver's verdict on every intermediate board is unchanged.
`latin-repeats.test.ts` pins the shape (`symbols`, stride, no repeat) as well.

**Two things a reader should not "fix".** The ledgers `row`/`col` went from
0/1 flags to counts and from a *scan-skipping optimisation* to something
load-bearing — the count decides when a hole line is full. The probe case that
called the ledger equivalent was rewritten accordingly. And the repeated symbol's
`place` records a `repeatFull` reason that is deliberately **not** part of
`LatinReason`: the Latin-square games' narrations switch over that union
exhaustively, and adding a case none of them can meet would make every one of
them narrate the impossible. A repeats consumer adds `LatinRepeatReason` to its
own union.

## D3. Set elimination with multiplicities

The C's `set` finds a zero-rectangle in a cells × symbols permutation matrix.
With a repeated symbol the matrix is no longer a permutation, so `setGeneral`
states the theorem behind it directly: rows demand `d_i` pairings, columns
supply `s_j`, totals equal; for a subset `R` of rows, if the columns it can
still reach supply exactly what `R` demands, every pairing into those columns
comes from `R`, and rows outside `R` lose them; less than it demands is a
contradiction. Column subsets are the same argument transposed, and with every
multiplicity 1 both are the classic hidden/naked set. Subsets are enumerated
outright — the matrices are at most `o × o`, `o ≤ 9`, and only a consumer with a
repeat pays for it. The three sweeps (`diffSet(false)` per row and per column
over cells × symbols; `diffSet(true)` per symbol over columns × rows, each with
that symbol's multiplicity on both axes) mirror the C's exactly.

## D4. Salad on the cube

- A **cross** clue or marker is the hole placed; a **ball** is the hole struck.
  The marker array is read back off `cubeOut` after a solve (`markersFromCube`),
  where upstream's `latinholes_solver_sync` wrote it by hand.
- The border deduction reads "known empty" / "known filled" off the cube
  (`isKnownHole`, `isKnownFilled`) where it read the marker array; the deduction
  itself is unchanged, and its recorded reasons and hint narration with it.
- `latinholes_solver_count` is gone: "a line with its `k` empties known ⇒ the
  rest hold symbols" is the ledger strike, "a line with its `nums` filled squares
  known ⇒ the rest are empty" is positional elimination on the hole with
  multiplicity. Number Ball has no user-solver left at all.
- `DIFF_HOLESONLY`, the Number Ball quality gate, is a fixpoint of the
  hole-only deductions (positional elimination on the hole; a cell whose only
  candidate is the hole) that never places a real symbol — the same question
  upstream asked ("do the holes fall out with no number entered?") on the new
  cube.
- Tiers keep their mapping: Normal = border deduction + generic simple rung;
  Extreme = + sets + forcing. What changed is *strength*: the simple rung now
  counts empties, so a board upstream needed set elimination for can fall at
  Normal. The `tooEasy` gate keeps Extreme honest against the stronger Normal.

## D5. The oracle survives — the finding that replaced the plan

The plan (proposal, tasks 3.1–3.2) was to retire the desc byte-match, since a
stronger solver publishes different boards and there is no C build to re-record,
and to re-found assurance on properties. The differential was rewritten that
way, run — and then a survey asked the question the plan had assumed the answer
to: **do the frozen descriptions still match?** All 15 Normal boards did, and
every Extreme board's difference was the tier gate's, not the solver's. Running
the original differential (loose gate, as before) against the new solver:
**28/28 byte-identical.**

So the repeated-symbol cube is *deductively equivalent* to upstream's hole
translation on every intermediate board of these 28 generations — the same
holes fall out at the same moments. That is unsurprising in hindsight (sync +
count + hidden sets over interchangeable hole symbols compute exactly what the
multiplicity-aware rungs compute), but it was not known, and it is the strongest
statement available about the rewrite. Per `AGENTS.md` ("often you can diverge
and keep the oracle as a test"), the differential is **kept unchanged** apart
from its header, `upstreamLooseGate` stays because the differential still sets
it, and the verdict-only rewrite is discarded.

**Consequences for the proposal's other ambitions**, stated plainly:

- **The boards do not change.** Every Salad description a player sees is what
  it was. The proposal's "every Salad board changes" did not happen, and
  nothing about the tiers needed re-grading — `salad.test.ts`'s property (every
  preset, both tiers: solves at its tier, Extreme does not solve at Normal) was
  already in place from `grade-difficulty-tiers-honestly` and still holds.
- **Number Ball's boards are no better and no worse.** The author's complaint
  was downstream of the framework gap; the gap is closed, but a better generator
  for the mode is a design nobody has yet made. That is the honest state, and
  it is recorded rather than dressed up.
- **What the change delivers** is the framework support the author asked for —
  a first-class repeated symbol, tested on its own — and a Salad solver with no
  translation layer: `latinholes_solver_sync`, `_count`, `_place_cross`,
  `_place_circle` are gone, the border deduction reads the cube, and the
  generic rungs do the rest. The next pseudo-Latin game gets it for one config
  line.

## D6. The hint keeps its architecture

`hint.ts` teaches emptiness as **marker steps** (cross/ball) whose reasons are
re-derived from the visible board — line counts, a note collapse, else the
cube's verdict — and that survives unchanged: the fixpoint markers it reads now
come off the cube rather than the retired sync. The cube's own strikes *of* the
hole symbol are still dropped from the strike walk, because the same fact
reaches the player as the marker step and teaching it twice would be noise; the
header explains this, and `repeatFull` is narratable should that ever change.
Every existing hint test — the three signature techniques, journeys, highlights,
narration arms, refusals, resumption — is the check that the explanations still
hold on the new solver.
