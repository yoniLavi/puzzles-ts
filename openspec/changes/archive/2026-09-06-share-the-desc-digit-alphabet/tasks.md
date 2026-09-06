# share-the-desc-digit-alphabet — tasks

Scaffolded 2026-09-06 by `share-the-run-length-desc-scanner`, task 1.3.

## 1. Extract

- [x] 1.1 `src/engine/desc-alphabet.ts` with `n2c` / `c2n`, `DESC_ALPHABET_SIZE`
      and a doc comment saying what the alphabet is, that it is frozen into
      shipped game IDs, and why a game's sentinel does not live here.
- [x] 1.2 Singles adopts it. Magnets adopts it and keeps its `-1 → "."` in a
      two-line local `n2c` over the shared one. Magnets' `c2n` had exactly one
      caller, inside its own `state.ts`, so it imports it directly rather than
      re-exporting — a pass-through re-export is a second name for one thing
      (`palisade/state.ts` says so where the same question came up).
- [x] 1.3 Catalog entry in `docs/games/engine-catalog.md`; the guard now counts
      48 engine modules.

## 2. Prove it

- [x] 2.1 **Both frozen differentials byte-clean**, and both games' own suites
      pass.
- [x] 2.2 Round-trip over the whole alphabet, both directions, plus a
      **distinctness** assertion — an off-by-one in one branch collides two
      values onto one character, and a value-first round-trip alone still passes
      for whichever of the two it checked second.
- [x] 2.3 **Proved it fails**: `65 + num - 36` → `- 37` turned four of the five
      red; restoring Singles' upstream `MAX_DIM` turned the bounds check red
      with `RangeError: desc alphabet: 62 is not a value it can write`.
      Restored.

## 3. The bug the extraction found

- [x] 3.1 **Both games could ask the alphabet for a number it cannot write**,
      and neither noticed because the arithmetic ran off the end of `A`–`Z` into
      punctuation instead of failing. `c2n` reads that punctuation back as `-1`,
      which both games' `validateDesc` rejects — so the game generated a
      description it then refused to load.
      - **Singles** capped `w` and `h` at `10+26+26` = 62. A cell holds
        `1..max(w, h)` and the alphabet's slots are `0..61`, so 62 was exactly
        one too many: a 62×62 board was unloadable. Checked against the C
        (`git show f8662aaa^:puzzles/singles.c`, `validate_params` line 271) —
        upstream has the same off-by-one.
      - **Magnets** capped neither dimension, following upstream
        (`git show 459b97ff^:puzzles/magnets.c`, `validate_params` line 240),
        whose only size test is the `w * h` overflow guard. A row clue counts up
        to `w`, so any board 62 wide had the same failure.
      - Both bounds are now **derived from `DESC_ALPHABET_SIZE`**, so they
        cannot drift from the alphabet again, and the test finds the largest
        board each game admits rather than asserting a literal.
- [x] 3.2 **`n2c` throws above the alphabet** instead of returning punctuation.
      It is now unreachable — the params bounds see to that — which is the
      argument for the throw rather than against it: silence is what let two
      games ship the defect.

## Findings

- **A clone that declares itself a clone is still worth checking by reading.**
  Magnets' header said "cloned from singles.c n2c/c2n", and it was true —
  `c2n` behaviorally identical, `n2c` different by one line. But the reading is
  what turned a tidying job into a bug fix: the shared module needed a *bound*,
  and asking what the bound should be is what exposed that both callers were
  over it. **Extracting a duplicate makes you state the contract, and stating
  the contract is where the defect surfaces.**
- **Unequal is not a third member, and only reading the bodies says so.** It
  exports the same two names and shares nothing else — order-dependent alphabet,
  `0` as a space, space/backspace keypresses for `interpretMove`. A scan on the
  name would have folded a display-and-input codec into a desc codec.
- **The bound was already written down, unnamed.** Singles' `MAX_DIM` was
  spelled `10 + 26 + 26` — the alphabet's own size, arrived at independently and
  then used as a dimension cap one greater than the values it can express. A
  constant written as its derivation is a good sign; a constant written as its
  derivation *in the wrong module* is how it ends up off by one.
