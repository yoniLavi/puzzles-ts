# ts-engine — deltas for derive-difficulty-from-the-technique-ladder

## MODIFIED Requirements

### Requirement: A tiered game declares its difficulty contract

A game with difficulty tiers SHALL declare an optional `difficulty` contract on
its `Game`: `tierOf(params)`, a pure `withTier(params, tier)`, and
`solveAtCap(params, desc, cap)` running the game's solver with its deduction
ladder capped at `cap`. A game without tiers omits it, exactly as a game without
a solver omits `solve`.

The contract SHALL NOT carry the tier list. **The tier names are read off the
game's own difficulty `paramConfig` item** — `difficultyTiers(game)` — which is
the list a player picks from, and which decides both *whether* a game is tiered
and *what its tiers are*. A `tiers` array on the contract was a second
hand-maintained copy of that list held equal to it by an assertion, and eight
games really did write the names out as two separate literals; there is nothing
for a derived list to disagree with.

Deriving the list SHALL NOT weaken the coupling the removed assertion carried.
Two equal string arrays never proved the contract and the form addressed the
same params field, so the guard SHALL instead assert that the form item's
`get`/`set` and the contract's `tierOf`/`withTier` move the same tier, for every
tier — a strictly stronger statement, and the one that fails when the derivation
finds some other `choices` item.

`solveAtCap` SHALL return a **discriminated verdict** (`"solved"` /
`"unsolved"` / `"impossible"`), not the raw integer its solver uses. The
collection's solvers report `-1 / 0 / 1` with meanings that are **not uniform** —
one game's `0` is "ambiguous", another's is "stuck", another returns a status
enum — so the per-game translation belongs in the adapter. Propagating the raw
integers would import 26 conventions into every cross-game consumer.

`solveAtCap` SHALL stay per-game and SHALL NOT be derived. Measured across all
29 contracts, its only shared step is `newState(params, desc)`, which `Game`
already provides and each adapter spends one line on; the cap is passed straight
through to the game's own solver, and the verdict mapping is the per-game
knowledge the discriminated verdict exists to hold. There is no capping logic to
share — the shared part was `latinVerdict`, and it is already extracted.

The contract SHALL describe what the game already does and SHALL NOT change any
board it generates: adopting it is a no-op, and a differential fixture that moves
means an adapter misreports its game's solver.

The tier list SHALL NOT be derived from the game's `DIFF_*` constants. A `DIFF_*`
constant is not reliably a tier: Solo declares eight and offers six (two are
solver verdicts), Galaxies' names list has five entries and two tiers, Singles
has a `DIFF_MAX` *and* a `DIFF_ANY`, and Salad has a `DIFF_HOLESONLY` at −1.

A tier that the game's solver understands but that the generator refuses at every
size SHALL still be offered in the form, because a saved game or a
description-carrying game ID may request it and `solveAtCap` must be able to
answer. Its refusal SHALL come from `validateParams` with a human-readable
reason, never from silent failure.

A tier that deliberately does **not** promise a uniquely-solvable board SHALL
declare itself, so that the cross-game guard asserts what that tier actually
promises rather than the opposite. Dominosa is the case, and it was found by the
guards rather than anticipated: the last entry in its difficulty menu is
"Ambiguous", and its generator branches on it to skip the uniqueness search
entirely — so a tier is not always a rung of the deduction ladder, it can instead
be a relaxation of what the puzzle promises.

Because generation is already uniform through `Game.newDesc(params, rng)`, the
contract SHALL NOT add a separate "generate at tier" entry point —
`newDesc(withTier(p, t), rng)` is that, and a second spelling of an existing
capability is how a contract sprawls.

#### Scenario: A newly tiered game is enrolled by declaring the contract

- **WHEN** a game with difficulty tiers declares `difficulty`
- **THEN** every cross-game difficulty guard covers it without further enrollment
- **AND** its tier list is read from the difficulty choices its custom-params
  form offers, so there is no second list for a game that gains a tier to leave
  stale
- **AND** a game that offers such a choice without declaring the contract fails
  the guard, so enrollment is conscription rather than invitation
- **AND** a game that declares the contract while offering no such choice fails
  the guard, because it would have no tiers at all and every per-game assertion
  would loop zero times over it while reporting health

#### Scenario: A tier is declared but generates at no size

- **WHEN** a tier exists in the solver's ladder but the generator refuses it
  everywhere
- **THEN** the tier stays offered in the form, so a saved game or game ID can
  still name it
- **AND** `validateParams` refuses it with a human-readable reason, which the
  guard requires — a tier that fails to generate and says nothing about why is a
  silent downgrade wearing a menu entry

#### Scenario: An adapter misreports its solver

- **WHEN** an adapter maps a solver's return value to the wrong verdict
- **THEN** the "every declared tier is reachable" guard fails, because a board
  the game's own generator just produced at that tier is reported unsolved
- **AND** the adapter is corrected rather than the guard relaxed

## ADDED Requirements

### Requirement: The difficulty tier list is not a projection of the technique ladder

A game's tier list SHALL NOT be derived from its declared deduction techniques,
and a change proposing to do so SHALL be answered with this requirement rather
than by re-surveying the games. `docs/framework-rdd/game-definition.md` proposed
the projection — *"if your techniques carry tiers … there is no hand-written
`DifficultyContract`; it is a projection of the technique ladder"* — and
`declare-deduction-techniques` appeared to supply the lever by giving every
technique a declared `tier`. It does not, for three independent reasons, each
sufficient on its own.

**A ladder declares tier *indices*; a tier list is *names*.**
`DeductionTechnique.tier` is a `number`. "Easy" and "Unreasonable" are strings a
player reads in the Custom dialog, and no projection invents them from integers.

**The projection runs the wrong way.** `runDeductionFixpoint` *receives*
`maxTier`, derived from a tier index — it is downstream of the tier list, not
upstream of it. Every ladder in the collection is an array literal built inside a
solve, closing over board state, so there is nothing to interrogate at module
load, which is when `paramConfig` and the params codec need the list.
`engine/latin.ts` makes this concrete: it synthesizes its rungs as `0..maxdiff`,
so asking that ladder for its tiers returns the cap it was handed.

**A tier is not always a rung.** Towers, Keen, Group, Unequal and Mathrax put
their top tier on `latinSolverRecurse`, outside the fixpoint entirely — and the
latin ladder still synthesizes a rung for it that can never fire, because no
built-in technique maps to that level and the game's `usersolvers` slot is
`null`. Dominosa's "Ambiguous" is a relaxation of what the puzzle promises rather
than a technique. Undead's only ladder on the shared runner is its *hint
recorder*, whose two techniques both sit on tier 0 while the game offers three
tiers. A ladder-derived list is short for every one of them.

The scope this was measured over SHALL be recorded rather than re-estimated:
14 games run a solver on the shared fixpoint runner (Group, Keen, Mathrax, Salad,
Towers and Unequal through `engine/latin.ts`; Clusters, Filling, Magnets,
Pattern, Singles, Spokes, Undead and Unruly directly), 29 declare a difficulty
contract, and the overlap is 12 — Filling and Pattern are untiered. Boats and
Loopy name `runDeductionFixpoint` only in doc comments explaining why they do not
use it, so a name-keyed scan over-counts them.

#### Scenario: A change proposes deriving tiers from techniques

- **WHEN** a change proposes projecting the difficulty contract from the
  technique ladder
- **THEN** it is refused with the three reasons above, which do not depend on
  which games are currently on the shared runner
- **AND** the reasons are re-derived only if `DeductionTechnique` starts carrying
  a tier *name*, the ladder becomes declarable without a board, and every tier a
  game offers becomes a rung — all three, since any one of them left standing
  defeats the projection on its own
