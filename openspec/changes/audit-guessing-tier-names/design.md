# Design

## Context

The guess-free policy has one sanctioned exception — a tier explicitly named
`Unreasonable` — and one test for whether a technique needs it. The test was
sharpened twice, and the second sharpening has never been applied to the code
it was about:

- **Sticks** (`hints.md` § "The forcing boundary") established that *a
  contradiction that does not propagate is exempt*: place one value, ask the
  validator once, take the other answer on INVALID. One inferential step.
- **Galaxies** (`add-galaxies-hint`, 2026-08-11) established the far side:
  hypothesise, run the whole deduction fixpoint, take the survivor. That is
  guessing, it is not a technique a player can learn, and its hint rung was
  deleted rather than moved to a harder tier.

Between them sits the shape nobody has ruled on, and it is the one the Latin
family uses.

## Goals / Non-Goals

- Goals: classify every trial-based rung by the propagation test; correct the
  tiers whose names promise more than they deliver; leave the rule enforced by
  something other than prose.
- Non-Goals: strengthening any solver; changing which boards generate at tiers
  that are correctly named; a collection-wide rename sweep for tidiness. If a
  tier's name is honest, it does not move.

## Decisions

- **D1 — The criterion is the owner's, not a proxy for it.** *Guessing rather
  than checking*, where checking means the player can look at a particular
  potential placement and see the contradiction without thinking more steps
  ahead. Read each rung's code and answer that question about the *player's*
  work, not about how the solver is factored — the same trial-and-oracle
  shape appears on both sides of the line.
- **D2 — Chain-following is the open question, and it is decided by length,
  not by mechanism.** `latin.ts`'s `forcing` walks a BFS over two-candidate
  cells: no solver run, but a chain. A two-link chain is arguably one glance;
  a nine-link chain is plainly not. Measure the distribution of chain lengths
  actually used on shipped boards before ruling — this is the same
  measure-then-decide the Undead forcing narration used (measured 130 chars,
  kept) and the Spokes look-ahead did not.
- **D3 — Prefer moving the *rung* over renaming the *tier*, where both are
  open.** A rename is player-visible and costs everyone who knows the game;
  gating a tier's generation to what its name promises costs only the boards
  that were mis-graded. Where the rung is load-bearing for the tier to exist
  at all, the rename is the honest move.
- **D4 — A hint that would have to narrate a search does not get to narrate
  it.** Galaxies' precedent stands as collection policy: refuse, and say what
  the position is. Any rung this audit finds on the wrong side and cannot move
  should lose its hint narration, not gain a euphemism.

## Risks / Trade-offs

- **The audit may find nothing**, and that is a good outcome to be able to
  state — a paragraph recording that each rung was read and classified is
  worth more than the silence it replaces.
- **A rename churns muscle memory** for players who know a game's tiers by
  name; weigh per game, and note that game IDs are unaffected.
- **Chain-following may split** — legitimate for a short chain, not for a long
  one — in which case the fix is a bound on the rung, not a verdict on the
  tier.

## Decisions taken on the audit's evidence (2026-08-12)

Full sweep and measurements: [`audit.md`](./audit.md).

- **D2 resolved — chain-following is propagation, and the length split it
  proposed does not exist.** Across 517 firings in thirteen configurations, a
  `latin.ts`-shaped forcing chain is **never shorter than 3 implication links**,
  and the reason is structural rather than statistical: a one- or two-link chain
  *is* a naked pair, and set elimination — a cheaper rung — has already fired on
  it. What reaches the forcing rung is by construction only what the cheaper
  rungs could not. On top of the chain the conclusion needs a **case split** on
  the origin cell. There is no short-chain sub-case to exempt.
- **D5 (new) — the rule is enforced literally** (owner, 2026-08-12, taken with
  the cost table in view). Every propagating rung ends under a tier named
  `Unreasonable`. Which of the rule's three remedies applies is *determined*, not
  a per-game preference:
  - a tier named `Unreasonable` already above ⇒ **the rung moves up to it**
    (Towers, Keen, Group, Solo, Map, and Unequal/Mathrax once renamed);
  - the rung's tier is the game's **top** tier ⇒ **that tier is renamed**
    `Unreasonable` (Salad, Dominosa, Bricks, Undead, Clusters, Spokes);
  - **never delete a tier.** Gating to nothing is not one of the three remedies,
    and a tier that vanishes teaches the player nothing.
  This **overrides D3's preference for gating over renaming** where the rung's
  tier is the top one: D3 assumed a rename was the expensive option, and it is
  the *cheap* one when the alternative is a tier ceasing to exist.
- **D6 (new) — a moved rung needs a viability measurement before it ships.**
  The `unsolved w/o forcing` column is the share of the tier's boards that go
  away, and it ranges from 0% (Group 8x8, Mathrax 6x6) to **98%** (Solo 3x3
  Extreme). A move is not done when the config line changes; it is done when the
  old tier is shown to still generate in acceptable time.
- **D7 (new) — `Recursive` is renamed `Unreasonable`** in Unequal and Mathrax
  (owner, 2026-08-12). The encoded difficulty character is untouched (`r`), so
  game IDs, saved games and shared links survive; only the menu label moves.
  It is also a prerequisite for D5's first bullet in those two games — a rung
  cannot move up to a tier that is not called `Unreasonable`.

## Open Questions

- ~~Does `latin.ts`'s `forcing` count as checking?~~ Resolved by D2.
- Should the guard be a declaration on the `Game` (a rung that trials must say
  so) or a per-game test? A declaration is checkable cross-game; a test is
  cheaper and does not widen the interface. **Leaning: neither is new** —
  promote `galaxies-hint.test.ts`'s speculative-vocabulary check into
  `src/engine/hint-quality.test.ts`, where every hinting game is already
  enrolled. It exists, it is cheap, and it currently guards one game out of
  thirty (audit §4).
