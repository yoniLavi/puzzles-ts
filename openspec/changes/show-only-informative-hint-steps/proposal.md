# show-only-informative-hint-steps

## Why

The owner's first playtest of the Tracks hint (`add-tracks-hint`) opened on
*"The track already enters and leaves this square, so it can use neither of its
other two sides: both must be blocked"* — about two sides the player had closed
off themselves by marking the squares beyond them empty. Asked for the fix at
the framework level rather than in Tracks: *"we only show and prioritize hints
that actually get us closer to the solution"*.

Measured before designing (2026-09-10, 20 boards across all three tiers, the
player following the plan one step at a time): **671 of 2,059 steps (33%) told
the player something their board already showed, and every one of them was
that single premise** — 671 fired, 671 redundant. The owner's broader instinct
that "marking cell edges as blocked is almost always useless" is exactly that
population: 91% of edge-blocking steps were it, and the other 64 were genuine
deductions (a loop that would close, track that would be stranded).

**It is a layer-below defect, not a Tracks one.** Three games have now needed a
filter for correct-but-worthless steps, and each hand-built its own: Spokes'
`markHelps`, Galaxies' `showable`, and Tracks' reason-less rules — which is how
Tracks missed one. Galaxies' version also carries the scar of the shared loop
not knowing about it: because `deduceHintPlan`'s cap counted firings, Galaxies
had to keep a second, hand-counted cap, after twenty unshowable firings in a
row once spent the whole budget and the hint refused on a board with a hundred
moves left.

## What changes

- **`deduceHintPlan` gains `showable(board, firing)`.** A firing that is not
  showable still advances the working board — later firings may rest on it —
  but becomes no step. The plan cap counts **shown** steps, so a run of hidden
  firings can never become a refusal, and the result reports a `hidden` count
  for vacuity guards.
- **Galaxies moves onto it** and drops its second cap. No behavior change; its
  reported-board regression passes, its vacuity probe now reading `hidden`.
- **Tracks hides what its board already says.** `trackComplete` joins the two
  rules that already declared no reason, every change is recorded as a firing,
  and the plan hides a firing that has no reason or whose every change the game
  would refuse the player the contrary of. Three guards hold the classification
  to the game's own move legality, judged on the board before each firing; one
  of them is the owner's report, reconstructed.
- **Spokes is a recorded no-go**: it trims *within* a firing and never applies
  what it drops, so there is nothing to advance.

## What is deliberately not built: a goal-first ranker

The request was "only show **and prioritize**". The first half is above. The
second was measured and is **not** extracted, for a reason the owner should
weigh (design D5):

- After hiding, Tracks' shown steps are **44% laying track, 52% deciding
  squares, 5% genuine edge deductions**. Those 5% are all Easy-tier loop/strand
  firings, and they fire only when no other Easy deduction exists — the ladder
  runs the two Easy rungs that lay track and decide squares first, and restarts
  from them after every firing.
- So a ranker preferring goal moves across candidates could only ever swap an
  **Easy** edge deduction for a **Tricky or Hard** one that lays track. That
  trades easy-first teaching — the ladder's whole point — for goal-first.
- The games that wanted goal-first (Spokes, Crossing, Galaxies) each got it
  from their own rung order, which passes the "could a game legitimately differ?"
  test: what counts as goal is per-game.

If the owner wants the ranker anyway, it is a follow-up with that trade-off
stated.

## Impact

- `ts-engine`: one ADDED requirement.
- Code: `engine/hint-plan.ts`, `games/galaxies/hint.ts`, `games/tracks/`.
- Player-visible: **Tracks' plan loses a third of its steps**, every one of them
  redundant. Galaxies is unchanged.
