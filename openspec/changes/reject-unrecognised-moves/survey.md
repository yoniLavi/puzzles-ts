# Survey — what each game did with a move it could not play

Task 2. The proposal's table came from a coarse grep and gave counts; this is the
**measured** classification, taken before any edit by handing every registered
game's `executeMove` a state from its own `newState` and the move
`{ type: "__not_a_move__", kind: "__not_a_move__" }` (both discriminant spellings
the collection uses), and recording what came back.

Worth doing rather than reading: **shape does not predict behaviour.** Four of
the twenty silent games dispatch on a `switch` — they simply `break` and then run
shared tail code, so an unmatched move falls past the switch and returns a clone.
A grep for "has a `default`" would have put them in the safe column.

## Result: 57 games, three outcomes

| outcome | count | games |
|---|---|---|
| **returns `undefined`** (falls off an exhaustive `switch`) | 8 | abcd, group, keen, mathrax, seismic, solo, towers, unequal |
| **silently returns a different board** | 20 | ascent, blackbox, crossing, flip, flood, magnets, net, netslide, pattern, rect, rome, salad, sixteen, slant, sokoban, spokes, subsets, twiddle, undead, unruly |
| **throws, but about something else** | 29 | the rest |

8 + 29 = 37, which is exactly what the loose form of `save-round-trip.test.ts`
caught, and 20 is exactly what it tolerated. The proposal's counts were right.

The third column is the "reports the wrong thing" row of the proposal's table, and
the messages show why it matters — none of these names the real problem:

```
bridges     m.ops is not iterable
fifteen     Illegal fifteen move to (undefined, undefined)
mosaic      Paint out of bounds
inertia     Invalid array length
signpost    Cannot read properties of undefined (reading 'n')
cube        cube: illegal move           ← true of a real roll into a wall
dominosa    dominosa: illegal move {…}   ← true of a legal-shaped move in an illegal place
```

The last two are the worst kind: they name the game and sound authoritative while
making a claim about the move that is not the one that is wrong.

## Two ways a foreign move got past a bounds check

Both found by the measurement, not by reading:

- **Subsets** validates `pos < 0 || pos >= w * h`. For a missing `pos`, *both*
  comparisons are false — so it passed the range check, indexed `immutable` with
  `undefined`, fell out of the inner `switch`, and returned an unchanged board.
  A range check written as two ordered comparisons is not a validity check.
- **Sokoban** passes `move.dx`/`move.dy` to `moveType`, which reads the grid at
  `(NaN, NaN)`, finds no barrel, and reports a **legal walk**. The board gained a
  move it never made.

The rule this produces, now in `docs/games/mechanics.md`: put the guard *before*
any bounds check it could hide behind.

## Task 2.2 — is any game's tolerance load-bearing?

No, as expected. Checked two ways: every game's own suite is green after the
change with no snapshot re-baselining, and the hint/solve paths that replay
synthetic moves (`playMoves`, `executeHint`, the render-scenario driver) all
construct moves from the game's own union.

One game was already stricter than the rest and is worth naming: **Pegs** ships
`serialiseMove`/`deserialiseMove`, so it parses at the save boundary and refuses a
foreign move before `executeMove` ever runs — design D3's rejected-as-primary
alternative, existing in one game. Its refusal now uses the same message shape as
everyone else's (`rejectMove(raw, "pegs: deserialiseMove")`); it previously said
`Invalid pegs move: [object Object]`, having stringified the raw value.

## One thing the tightened guard found that is not about moves

**Sixteen exports a `serialiseMove`/`deserialiseMove` pair that is never wired
into `sixteenGame`.** Production has always used the default identity codec —
`SixteenMove` is plain JSON, which is why nothing noticed. Its own test
round-trips the pair against itself, and *a round-trip test passes whether or not
anybody calls either half*: the familiar shape of a guard measuring a neighbour of
the thing it claims to guard.

Deleted rather than wired. Wiring it would change the bytes of every existing
Sixteen save, which is the owner's call, not a refactor's. Flag at acceptance if a
compact Sixteen move encoding is actually wanted.
