# bricks Specification Delta — audit-guessing-tier-names

Bricks' ladder becomes **`Easy · Unreasonable`** (design D11, owner decision
2026-08-12).

`solverRecurse` places a colour and then **solves the rest of the board** from it
— a *Search* under design D9 — and it is what upstream's `Normal` tier is made
of, so that tier takes the name. Renaming it alone would have given
`Easy · Unreasonable · Tricky`, an ordering no player can read; the way out is
that Bricks does not have three tiers. Upstream's `Tricky` is the same rung one
level deeper, `grade-difficulty-tiers-honestly` measured that depth 2 decides
nothing depth 1 has not, and it has been refused at generation ever since — so
what is dropped is not a tier but a **label for a tier that names no boards**, and
a dropdown entry that could only ever produce an error.

Nothing a player could previously play is removed, `DIFF_CHARS` still spells the
third level so an old game ID or saved game still loads and is still refused with
its reason, and no board moves.

Two things found on the way, both of which are the point rather than incidental:

- Bricks' difficulty contract and its custom-params dialog each **hand-copied**
  the tier list. That is the defect this change had already fixed in Unequal, in
  a game nobody had checked; both now read one list.
- Dropping a name from a declared list **silently drops the cross-game guard that
  iterated the list** — `difficulty-contract.test.ts` covers the tiers a game
  declares. That guarantee moves into the game's own suite explicitly.

## MODIFIED Requirements

### Requirement: Bricks game implements the Game interface

The engine SHALL provide `src/games/bricks/` implementing the `Game` interface for
Bricks, registered so the puzzle is served by the TypeScript engine.

Parameters SHALL be a width, a height and a difficulty (Easy or `Unreasonable`).
The harder tier is named `Unreasonable` rather than upstream's `Normal` because
its rung commits a cell by solving the rest of the board from a hypothesis, and
only a tier of that name may ship such a rung. Validation SHALL require width at
least 2, height at least 2, and a known difficulty. A game ID SHALL encode the
width, height and difficulty and round-trip through decode; the encoded
difficulty characters are unchanged by the rename, so an existing game ID names
the same board.

The tier names SHALL have a single definition in the game, read by the preset
menu, the difficulty contract and the custom-params dialog alike, so that no two
of them can disagree.

The board SHALL be a hexagon stored as a padded parallelogram: the actual grid
width SHALL be the parameter width plus the ceiling of half the height minus one,
with the two triangular corners masked as boundary cells, leaving exactly
width-by-height playable cells. Neighbours SHALL be the fixed six-direction hex
step set. This geometry SHALL be bespoke and SHALL NOT depend on the shared grid
tiling engine.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose unique solution the solver reaches, marking it
  complete

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered

#### Scenario: The menu, the contract and the custom dialog offer the same tiers

- **WHEN** the tier names the preset menu shows, the tiers the difficulty
  contract declares, and the choices the custom-params difficulty field offers
  are compared
- **THEN** they are the same list

### Requirement: Bricks offers only difficulties that exist

Bricks SHALL offer Easy and `Unreasonable`, and SHALL NOT offer upstream's third
tier **as a name at all**: it names no boards, so it appears in neither the preset
menu, the difficulty contract, nor the custom-params dialog.

It SHALL nevertheless remain **decodable**. The difficulty character set is
unchanged, so a game ID or saved game carrying that tier still parses and still
round-trips; `validateParams` SHALL reject it when asked for a full
(generation-capable) parameter set, naming the difficulty and the tiers that do
exist, while continuing to accept it otherwise so such a game still loads.

Bricks' tiers are lookahead depth — Easy assumes nothing, the harder tier assumes
a cell and looks for an Easy-level contradiction, and upstream's third lets that
sub-solve recurse in turn — and depth 2 decides nothing depth 1 has not already
decided. Upstream conceded the symptom in its own documentation ("selecting Tricky
difficulty may generate a puzzle at Normal difficulty instead") and this port
preserved it as an intended quirk; measurement retired the quirk, because *may* is
always. The depth-2 rung SHALL remain available to the **solver**, where hints,
Solve and mistake-checking use it as "try as hard as you can" at no cost.

Because the tier is no longer declared, the cross-game difficulty contract no
longer covers it; the game's own suite SHALL assert that its difficulty character
still round-trips through a game ID, so that dropping the name cannot silently
change what an existing ID means.

#### Scenario: The undeclared tier is not generated

- **WHEN** a full parameter set requesting the depth-2 tier is validated
- **THEN** it is rejected with a message naming the difficulty and the tiers that
  do exist
- **AND** the same parameters validate successfully when a description is
  supplied rather than generated

#### Scenario: The undeclared tier still round-trips through a game ID

- **WHEN** a game ID carrying the depth-2 difficulty character is decoded and
  re-encoded
- **THEN** the same difficulty is recovered and the same game ID is produced

#### Scenario: The generator refuses rather than exhausts its retries

- **WHEN** the generator is called at that tier anyway
- **THEN** it fails immediately, rather than rejecting candidates until its retry
  budget is spent

### Requirement: Bricks provides an explained deduction hint

Bricks SHALL implement the `hint` and `hintKeepTrack` hooks so a player can ask
why the next move is forced. A hint SHALL be computed from the game's own
contradiction solver — the solver and the hint SHALL be two projections of one
deduction engine — so that every hinted move corresponds to a deduction the
solver can make from the player's current position, and the plan SHALL be
recompute-stable: a deterministic scan order, so a hint recomputed after a
followed move continues where the previous plan left off.

Each hint step SHALL explain *why* the move is forced, not merely which cell to
act on: for a single-cell contradiction it SHALL name the concrete rule the
opposite colour would violate — three shaded bricks in a horizontal row, a shaded
brick with no shaded brick beneath it to rest on, or a clue that the change would
push above or below its shaded-neighbour count — stating the premise, the
contradiction, and the conclusion in the necessity voice. The forced cell SHALL
be highlighted as the hint target and the deduction's evidence cells SHALL be
marked distinctly on the board so the reasoning is visible and not only in prose.
The hint SHALL NOT pre-place the forced colour. Because every Bricks deduction
forces exactly one cell, each hint step SHALL be a single self-contained journey.

**The recursive lookahead rung SHALL NOT be narrated at all.** It commits a cell
by solving the rest of the board from a hypothesis, which is a search, and no hint
narrates a search on any tier. The recorder SHALL omit it while the solver retains
it, so grading and generation are unchanged and no description moves; where the
single-cell rung runs out, the hint SHALL refuse rather than reach for it.

The single-cell rung's own **unclassified** case — one colour placed, one
validator call, the board breaks at a cell none of the named rules matched — SHALL
be narrated as what it is: the break is at a marked cell and nothing was followed
to reach it. It SHALL NOT inherit the recursive rung's wording, which described
following a chain of forced consequences and was never true of this case.

A hint SHALL be refused, with an explanatory banner, when the board is already
solved, when the board contains a rule violation (as reported by
`findMistakes`), or when the player's placed cells contradict the unique solution
without yet breaking a local rule — in the last case the banner SHALL say a
placed cell must be wrong rather than deduce onward from a doomed position.

#### Scenario: A forced move is explained by the rule it would break

- **WHEN** a hint is requested on a solvable, mistake-free board where a
  single-cell contradiction is available
- **THEN** the forced cell is highlighted as the target, its evidence cells are
  marked, and the explanation names the rule (three-in-a-row, a brick left
  unsupported, or a clue's neighbour count) that the opposite colour would
  violate, without pre-placing the forced colour

#### Scenario: The lookahead rung never reaches a narration

- **WHEN** hint plans are recorded across every tier and many seeds
- **THEN** no step is forced by the recursive lookahead rung, and where only that
  rung could progress the hint refuses instead

#### Scenario: The unclassified break is narrated as a break, not as a chain

- **WHEN** the single-cell rung forces a move by a contradiction none of the
  named rules matched
- **THEN** the narration says the board breaks at the marked cell, and does not
  claim any chain of consequences was followed

#### Scenario: A hint is refused on a solved, mistaken, or wrong-but-legal board

- **WHEN** a hint is requested on a board that is solved, that contains a
  rule-violating cell, or whose placed cells contradict the unique solution
  without yet breaking a local rule
- **THEN** no move is hinted and an explanatory banner is shown, and for the
  last case the banner states that a placed cell must be wrong

### Requirement: Bricks grades the tiers it does offer

A Bricks board generated at a difficulty above the easiest SHALL NOT be soluble at
the tier below it. The acceptance gate SHALL probe the tier immediately below the
one requested; upstream probes at Easy whatever tier was requested, which is
correct for the second tier only by coincidence.

Because generation is solver-gated at every clue removal, the byte-for-byte
differential SHALL retain a way to run upstream's original gate, used by that
differential alone. The rename changes no description: it is a menu label, and the
solver's rungs are untouched.

#### Scenario: An Unreasonable board genuinely needs its own tier

- **WHEN** a board generated at `Unreasonable` is solved at Easy
- **THEN** the solver does not reach a solution
- **AND** solving the same board at `Unreasonable` does
