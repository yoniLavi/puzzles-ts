# Design — add-numgame-ts-port

## Context

This is the odd one out among the seven remaining changes. The other four game
proposals (Group, Slide, Sokoban, Path) port an existing `struct game`; numgame
has none. `numgame.c` is a **standalone command-line solver** for the Countdown
numbers game — upstream states plainly it "hasn't even started on writing a
Puzzles user interface yet." So this change *designs a game* over an existing
solver, and the design work dwarfs the transcription.

Because of that, this document records **open questions, not settled decisions**
— the settling happens with the owner if and when the change is scheduled.

## D1 — Should this game exist? (the gating question)

The collection is a *logic*-puzzle collection. A Countdown game is
mental-arithmetic — closer to a maths drill than a deduction puzzle. It may not
fit the character, and there is no user demand signal (it was never shipped by
upstream in 20 years). **Recommendation: treat this change as a placeholder for
a deliberate owner decision, defaulting to "not now".** The value of scaffolding
it is that the shape and the solver-reuse are captured so the decision is
informed, not that the work is queued.

## D2 — What is invented vs transcribed

- **Transcribe faithfully:** the BFS solver. It exhaustively enumerates
  reachable values and counts distinct derivations — the exact primitive a
  generator and a hint need. It is small and well-understood. Its `tree234`
  dedup becomes a `Map`/`Set` keyed by value (a pure lookup; the playbook's leaf
  rule).
- **Invent from scratch:** everything a player touches — how sources and derived
  numbers are shown, how an operation is expressed as a move, how the board
  animates, win detection. There is no upstream reference and no differential
  possible for any of it.

## D3 — The only differential available is arithmetic

There is no C *game* to byte-match, so the generator/codec/UI cannot be
differential-checked the way every other port is. The **solver's arithmetic
results** can be: for a fixed set of number sets, the reachable-value → ways map
must match the C utility. That is the whole differential surface. Everything
else rests on ordinary behavioural tests. This is a real weakening of the usual
assurance and should be stated plainly to the owner — it is a consequence of
there being no game upstream, not a shortcut.

## D4 — Difficulty is genuinely unsolved upstream

`numgame.c`'s TODO block discusses why path-counting overstates difficulty
(associativity and tree-structured calculations inflate the count) and never
resolves it. Do **not** inherit that rabbit hole for v1. A simple heuristic —
number of operations required, presence of a non-trivial step (a division, a
large intermediate) — is enough to grade a first version, and can be refined
later. Record the heuristic chosen; do not promise upstream's unbuilt analysis.

## Risks

- **It is a build, not a port**, so the usual "faithful transcription is the
  low-risk path" does not apply to the 80% that is UI/UX/difficulty.
- **No game-level oracle** (D3) — assurance is weaker than every other port.
- **Character fit** (D1) is unresolved and may kill the change outright, which
  is fine and is the point of scoping it cheaply now.
