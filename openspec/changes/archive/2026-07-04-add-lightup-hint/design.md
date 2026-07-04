# Design — add-lightup-hint

## D1: Recorder shape — threaded and gated, not parallel

Light Up's hint techniques are exactly its solver's techniques, and the solver
is byte-match-load-bearing (the generator is solver-gated twice over). So the
recorder is threaded through the existing functions and **gated on presence**
(the Singles/Range shape, not Pattern's parallel recorder): every reason
allocation sits behind `if (recorder)`, and the recorder-off path must remain
byte-for-byte identical — verified by the existing differential staying green.
The plan runs the deduction from the player's current marks (bulbs +
impossible-marks are honoured as constraints, exactly as `solve()` from
`currstate` does), recording per firing:

- **forcedLight** (`trySolveLight`): the unlit square + its corridor of
  candidate positions (all but one eliminated) → a `light` move.
- **clueSatisfied** (`trySolveNumber`, `nl === 0` branch): the clue + its
  remaining free neighbours → one grouped `impossible` (mark) firing.
- **clueSaturated** (`trySolveNumber`, `nl === ns` branch): the clue + its
  free neighbours → one grouped `light` firing.
- **discount** (`trl_callback_discount` marking a square impossible): the
  MAKESLIGHT set that the candidate would extinguish → an `impossible` move.

The discount rung records **one firing per discounted square** (the callback
fires per candidate); the `goto reduction_success` restart already limits a
pass to its first successful discount-set sweep, which keeps group boundaries
honest without a per-firing early-return retrofit — verify against the
"one group = one firing" §3 rule with a bleed test anyway.

## D2: Marks as the external memory (§1B) — and their lifecycle

An elimination step's move is the game's own `impossible` mark, so following
the plan leaves the same trail the solver reasons over; a later `forcedLight`
step's narration ("every other way to light this square is crossed out") is
then *visible* on the board. Two consequences:

- `hintKeepTrack`: a player move that places the hinted mark/bulb on a subset
  of the step's cells is `onTrack` (shrink the step in place), the full set
  `completed`, anything else `off`. Remember it receives the PRE-move state.
- A hint-placed mark is always sound (it derives from the unique solution's
  logic), so it can never trip `findMistakes` (which flags only
  marks-on-solution-bulbs).

Auto-hint applies marks for real; the manual display is highlight-only
(§5.1 — no mark preview).

## D3: Narration sketches (to be tuned against §2 at implementation)

- forcedLight: "This square isn't lit yet, and every other square that could
  light it is crossed out or already lit — a bulb here is the only way. So
  this square must hold a bulb."  (Lead with the unlit square; shade the
  corridor; the eliminated candidates are visible as marks/lit cells.)
- clueSatisfied: "Clue N already has all N of its bulbs. Its remaining free
  neighbours can't hold another — so they must all be crossed out."
- clueSaturated: "Clue N still needs M bulbs and has exactly M free
  neighbours — so every one of them must be a bulb."
- discount: "Every way to light the shaded square runs through the shaded
  cells. A bulb here would light all of them, leaving that square in the
  dark — so this square must be crossed out."  (The clue-combination variant
  names the clue instead of the unlit square.)

Degenerate-extreme check (§2.7): clue 0 (satisfied at zero bulbs) and a clue
equal to its neighbour count (saturated immediately) both read correctly in
the sketches; re-check at implementation.

## D4: The Hard-tier policy debt — measure, then (lean) rename

Light Up's difficulty ladder: Easy = forced-light + clue rules; Tricky = +
overlapping-set discount; Hard = + recursion (depth ≤ 5), and the generator
*rejects* Hard boards solvable at Tricky — so every Hard board needs guessing
by construction. Per the narratable-deduction policy that is only allowed
under an `Unreasonable` name. Resolution order:

1. **Measure**: over N seeded Hard boards, what recursion depth does the
   solve actually need — how many are depth-1-only (single-level forcing =
   deduction per §1A/§1B.1) vs deeper?
2. **Default lean — rename Hard → Unreasonable.** A pure label change
   (presets, paramConfig choices, augmentation template, help text): board
   generation, the params encoding (`d2`), and the byte-match differential
   are untouched. The hint then covers Easy/Tricky fully; on Unreasonable
   boards it narrates the deductive prefix and refuses honestly at the
   guess point ("this board needs trial and error beyond these deductions"),
   the sanctioned non-deductive allowance.
3. **Alternative if the measurement argues for it** (e.g. nearly all Hard
   boards are depth-1-only): keep a renamed deductive top tier by promoting
   single-level forcing to a narrated technique via the externalized
   what-if walk (§1B.1) — costlier; only with owner buy-in.

The owner picks at implementation time with the numbers in hand; the spec
delta is written to require compliance, not a specific remedy.

## D5: Colour legend row (target table entry for hint-authoring.md §5.3)

| game | move | premise type(s) → colour + cue |
| --- | --- | --- |
| Light Up | forced square, blue `COL_HINT` fill (bulb *and* mark targets identical — the narration says which; no mark preview) | corridor / clue free-neighbour evidence → `COL_HINT_CELL` shade; the driving clue's digit is on the shaded cell (Palisade convention); a cited decided premise (a placed bulb blocking a corridor) → teal `COL_HINT_BLACKREF`-style ring if needed |

Colours appended at indices 7+ (past the C enum; dark-mode `paletteOverrides`
for lightup touch only 2/3, so appended indices are safe). All hint bits go
into the per-tile packed cache key (§3.2).
