# fix-solo-solve-from-aux — tasks

- [x] 1.1 Decode `aux` in the format this repo's own `encodeSolveMove` emits —
      a comma split of exactly `cr²` integers in `1..cr` — and fall through to
      the givens re-derivation when it does not parse, rather than trusting a
      malformed payload.
- [x] 1.2 Regression test in `solo.test.ts` that deals from a **`params#seed`
      id** for every one of the sixteen presets, so `aux` is present and the
      branch a player takes is the branch under test. Asserts both that no cell
      lies outside `1..cr` and that `checkValid` holds.
- [x] 1.3 **Proved it fails**: restoring the original `charCodeAt(i + 1) - 48`
      decode turns the new case red on the first preset (`2x2 Easy: solved grid
      holds a value outside 1..4`) while all fifteen other Solo cases stay
      green — including the existing "solve fills a valid grid for a
      uniquely-solvable board", which is the point.
- [x] 1.4 Checked the class across the collection rather than assuming it was
      one game: for all 32 preset-cases where a generator emits an `aux`, the
      aux route and the re-derive route were compared move-for-move. **Solo was
      the only genuine disagreement.** Dominosa's two routes return the same
      domino set in a different order — a false positive, not a defect.

## Findings

**The bug is a mismatch between two halves of one format, and the test suite was
structurally unable to see it.** `aux` is populated only when the midend
*generates* a board; every Solo test dealt from a recorded `params:desc` id,
where `aux` is absent and `solve` re-derives from the givens instead. So the
existing case — "solve fills a valid grid for a uniquely-solvable board", which
asserts exactly the right property — could not fail, and sixteen presets shipped
a Solve that wrote nonsense into half the grid and then declared the puzzle
complete.

**The general shape, worth carrying:** *a fixture id and a played game can take
different code paths through the same entry point.* Anywhere a `Game` method
takes an optional argument the midend only sometimes has — `aux` is the one in
the contract today — a desc-id fixture tests the other branch. The cheap
countermeasure is what the regression test does: deal from a `params#seed` id
somewhere in the game's own suite.

**Why the comment was load-bearing in the wrong direction.** The decoder carried
`// aux is an "S<digit><digit>…" encoded full solution (encode_solve_move)`,
which describes **upstream's C format** accurately. The port's own encoder had
diverged to commas — necessarily, since a cell reaches 16 at 4x4 and no single
character carries that — and the decoder was written to the comment rather than
to the encoder eight hundred lines away. `AGENTS.md` § "Method" already says a
fact about the codebase rots; this one was never true of *this* codebase.
