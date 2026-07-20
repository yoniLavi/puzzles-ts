# add-numgame-ts-port

## Why

`puzzles/unfinished/numgame.c` is the most *un*finished of upstream's
experiments: a standalone command-line breadth-first solver for the Countdown
numbers game (and Flippo-style variants), with — in upstream's own words — no
Puzzles user interface written yet. Unlike Group, Slide and Sokoban, there is no
`struct game` to port: this change is not a *port*, it is **building the game
upstream never built**, over a solver that already exists.

It is scaffolded now so the decision is captured and the shape is scoped, not
because it is next. The engine is complete and every catalogued game is ported,
so this is exploratory: the collection *could* grow a mental-arithmetic puzzle,
but whether it should — and whether an arithmetic game fits the "logic puzzle"
character of the collection — is an open product call. Expect this to be done
much later, or not at all.

## What Changes

- **A new `src/native/games/numgame/` game**, invented rather than transcribed:
  a Countdown-style puzzle where the player is given a set of source numbers and
  a target and must combine them with `+ − × ÷` to reach it.
- **The BFS solver ported from `numgame.c`** as the reusable core — the one part
  that already exists and is worth transcribing faithfully: it enumerates every
  reachable value and counts the distinct ways, which is exactly what a
  generator (pick numbers that admit a unique-ish, appropriately-hard target)
  and a hint need.
- **A game interface designed from scratch**: how a number game is presented and
  played on a canvas (source tiles, an expression the player builds, operators),
  the move model, and win detection. This is the bulk of the work and has no
  upstream reference.
- **A difficulty model**, which upstream flags as unsolved (its TODO discusses
  associativity inflating path counts and the "obviousness" of operations). The
  proposal must decide how much of that to take on versus ship a simple metric.
- **Stage 2, on owner acceptance**: register `numgame` in the catalog (it never
  had an entry — new icons required) and delete `puzzles/unfinished/numgame.c`.

Explicitly **not** in this change: a from-C byte-match differential of the
*game* (there is no C game to match); only the solver's *arithmetic results* can
be differential-checked against the C utility.

## Impact

- Affected specs: new `numgame` capability.
- Affected code: new `src/native/games/numgame/`, catalog + icon additions,
  registration.
- This is a **build**, not a port — size and risk are dominated by the invented
  UI/UX and the difficulty model, not by the (small, well-understood) solver.
- Lowest priority of the seven remaining changes; decide whether to do it at all
  before scheduling it.
