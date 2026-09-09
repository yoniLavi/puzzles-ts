# fix-solo-solve-from-aux

**Readiness: ready.** A defect with a proven cause, a one-site fix, and a
regression test proven to fail without it.

Found 2026-09-09 by `guard-the-mistake-invariant` on its first run.

## The defect

**Solo's "Solve" corrupted every board a player was actually dealt.**

`encodeSolveMove` writes the generator's solution as `"S<n>,<n>,…"` —
comma-separated, because a cell reaches **16** on the 4x4 preset and no single
character can carry that. `solve()` decoded it as upstream's C does, one
character per cell:

```ts
for (let i = 0; i < cr * cr; i++) grid[i] = aux.charCodeAt(i + 1) - 48;
```

Every separator decoded as `","` − `"0"` = **−4**. Measured across all sixteen
presets: **8 of 16 cells wrong on 2x2, 40 of 81 on 3x3, 111 of 256 on 4x4**, and
`checkValid` false on every one of them. The fixed clue cells are overwritten
too, because the solve move writes all `cr²` cells. And `executeMove` sets
`completed = true` unconditionally, so **the app reported a solved puzzle over a
grid that was half nonsense**.

## Why sixteen presets shipped it

**`aux` exists only on a board the midend *generated*.** A `params:desc` id
carries no `aux`, so `solve()` falls through to re-deriving from the givens —
which is correct. A `params#seed` id, and the New game button, generate, so
`aux` is present and the broken branch runs.

Every Solo test dealt from a `params:desc` id. `solo.test.ts`'s "solve fills a
valid grid for a uniquely-solvable board" asserts exactly the right thing and
**could not fail**, because it never reached the branch a player takes.

That is the shape worth carrying: *a fixture id and a played game take different
code paths through `solve`*, and the whole suite was on the side players are not.

## Why the guard found it through one preset out of sixteen

Once `solve` had corrupted the **givens**, `findMistakes` re-derived from those
corrupt givens, got `DIFF_IMPOSSIBLE`, and returned `[]` — reporting health.
Killer is the one Solo preset with **no givens at all**, so its re-derivation
succeeded from the cage sums and the diff against the corrupt grid was visible:
76 mistakes on a "solved" board. A guard can be right and still see one
sixteenth of what it caught.

## The fix

Decode what this repo's own encoder emits, and validate before trusting it: a
comma split of exactly `cr²` integers in `1..cr`. A malformed `aux` falls
through to the givens re-derivation rather than failing — it reaches the same
answer from the puzzle itself.

## Impact

- Affected specs: none. Solve was already required to produce the solution.
- Affected code: `src/games/solo/index.ts` (`solve`), plus a regression test in
  `solo.test.ts` that deals from a **seed** id and is proven to fail on the old
  decode.
- **Player-visible, and not a judgment call**: Solve is restored to working. No
  save format, game ID or desc changes.
