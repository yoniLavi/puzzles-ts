# show-only-informative-hint-steps — design

## D1. A predicate judged after the firing, not a transform

`showable(board, firing): boolean`, called after the firing has been applied
(by `apply`, or by a `next` that applies as it detects — both shapes are in the
tree). A predicate, not a transform: Galaxies also *trims* a firing before
judging it (a `dotTile` firing drops the cells the game would refuse), and that
stays in its `next`, where the firing is built. The loop only has to know
whether to show.

Judging after the apply is what the loop can offer without knowing how to clone
a board, so the obligation goes to the predicate: **read only facts the firing
itself cannot have created.** Both adopters meet it by construction (stated at
each site): Galaxies' legality check reads dots and walls, never associations;
Tracks' reads empty squares and rails, which no firing whose every op is
evident can create.

## D2. The cap counts shown steps, and the firing cap goes

A cap on firings silently becomes a refusal when hidden firings spend it.
Galaxies learned that as a shipped bug and answered it with two caps. With the
loop counting only shown steps, the second cap has no job: termination needs
none, because every firing decides at least one cell or wall, and a firing that
changes nothing still trips the step budget, which the loop ticks for hidden
firings too (tested).

## D3. Tracks: a declaration held equal to a derivation

The obvious fully-derived design — narrate every rule, let the board predicate
hide — needs dead narration for the three rules that are *always* evident. The
obvious fully-declared one — a list of silent rules — is what shipped and
missed `trackComplete`. So both, each checked against the other:

- **Declared:** the three rules that restate the board carry no reason.
- **Derived:** `evident(board, op)` — the game would refuse the player the
  contrary. Production hides a firing with no reason *or* whose every op is
  evident, so a narrated rule that lands on an already-decided side is hidden
  wherever the scan order puts it.
- **Held equal:** every reason-less firing is evident by `uiCanFlipSquare` /
  `uiCanFlipEdge` on the board *before* it landed, and the production predicate
  agrees with that legality test on every firing in the corpus.

That is `canMarkAll`'s shape (`docs/games/testing.md` § "How a cross-game guard
finds its population"): a flag production needs synchronously, kept honest by a
derivation it cannot drift from.

**Proved in layers, because "belt and braces" is a claim too.** With
`trackComplete` given back a reason — the first half of the reported bug — and
the board check intact, all four guards stay green: the board check hides it by
itself, so it is a live defense rather than decoration. Remove the board check
as well, reinstating the reported bug in full, and the two player-facing guards
go red on the reported shape, naming a step that asks to block a side of the
entrance the board already decides. The two classification guards were proved
separately, each by a mutation only it catches.

## D4. Spokes stays as it is

Spokes filters inside `findExhaustion`: it keeps the rule-outs that reach a hub
still needing lines and drops the rest **within** one firing, and it never
applies what it drops, because a mark between two finished hubs is never
load-bearing. The hook is all-or-nothing per firing and exists to advance the
board without showing; Spokes needs neither half. Recorded as a no-go.

## D5. The ranker is not extracted

See the proposal. The measurement that decides it: after hiding, the only
non-goal steps left in Tracks are Easy-tier edge deductions that fire when no
other Easy deduction exists, so goal-first ranking could only promote a harder
technique over an easier one. Every game that has wanted goal-first got it from
its own rung order, and what counts as "goal" is per-game.

## D6. Legality is judged before, never after

The first cut of the guards asked `uiCanFlipEdge` on the board after the
firing. That makes every block look evident, because the op's own
`E_NOTRACK` is what the contrary is refused on. The guards snapshot the board
before each `next()` — safe because every change the recording pass makes is
now its own firing, so "before this `next()`" is "before this firing".
