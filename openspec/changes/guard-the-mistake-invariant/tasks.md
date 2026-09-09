# guard-the-mistake-invariant — tasks

## 1. The guard

- [x] 1.1 `src/engine/mistake-invariant.test.ts`: for every game carrying
      `findMistakes` (derived from the capability set, not from a grep), deal a
      board and assert no mistakes; solve it and assert no mistakes.
- [x] 1.2 Deal from a **seed** id, not a desc id. `aux` — the generator's own
      solution — exists only on a generated board, so a `params:desc` fixture
      exercises a different `solve` path from the one every player takes. This
      is not a detail; it is what the guard found (task 3).
- [x] 1.3 Vacuity floors on the registry (≥50) and on the derived population
      (≥35), plus a per-game floor on the presets dealt.
- [x] 1.4 Price the preset slice rather than guessing it. Measured idle:
      **every leaf preset 120 s**, `hint-resume`'s exact slice ~30 s, **one per
      tier (first preset only for an untiered game) 9.7 s** — which is what
      ships, with the reason recorded at the site: this class desynchronizes on
      a *cap or clue structure*, which varies by tier and mode, not by board
      size. The slow tier takes every preset.

## 2. Prove it fails

- [x] 2.1 Invert Towers' `findMistakes` predicate (`!==` → `===`, so every
      correct cell is flagged) and confirm the guard goes red. Restored.

## 3. What it found on its first run

- [x] 3.1 **Solo's "Solve" corrupted every generated board.** Filed and fixed
      separately as `fix-solo-solve-from-aux` — the encoder writes
      `"S<n>,<n>,…"` and the decoder read one character per cell, so every
      separator became `,` − `0` = −4: 8 of 16 cells on 2x2, 40 of 81 on 3x3,
      111 of 256 on 4x4, fixed clues included, with `completed` set regardless.
- [x] 3.2 Record in the guard's header **what it could not see**: once `solve`
      had corrupted the givens, fifteen of Solo's sixteen presets had their
      `findMistakes` re-derive from corrupt givens, hit `DIFF_IMPOSSIBLE` and
      return `[]` — reporting health. Killer, alone in having no givens, was the
      one preset where the diff was visible.

## 4. Say what is still uncovered

- [x] 4.1 The other direction — *a seeded wrong board reports non-empty* —
      stays per-game, for the reason `mistake-overlay-coverage.test.ts` already
      records: reaching a mistaken board takes a game-specific move. A
      `findMistakes` stubbed to `return []` passes this guard, and the header
      says so rather than implying a totality it cannot have.

## Findings

**The guard found a shipped, player-visible bug on its first run, in a game with
1,553 lines of solver and a full differential corpus.** That is the argument for
the class it protects, and it is worth stating precisely: `findMistakes` and
`solve` are two hand-wired consumers of one solver, and nothing had ever made
them meet. `assert-that-tiers-bind` found the same shape between a generator and
a difficulty contract three days earlier.

**The instrument note that matters for the next guard.** This one is honest
about a blind spot it demonstrably has — it saw its own catch through one preset
out of sixteen, because the corruption disabled the very re-derivation the check
depends on. A guard whose oracle can be destroyed by the defect it is looking
for will under-report rather than fail, and the only reason the population was
not zero is that one Solo preset has no givens to destroy.

**Five name-keyed false positives were caught while sizing this work**, all in
one session and all the cataloged trap: `latinSolver<Ctx>(` defeating a
call-site grep; `engine/candidate-hint` matching a *comment* in Seismic; the
same for `runDeductionFixpoint` in Loopy's and Boats' solver headers, which
explain at length why those games do **not** use it; and `engine/latin.ts`
matching Ascent's and Tents' import of `matching`, a bipartite-matching utility
that merely lives there. Every census of engine reach should scan
comment-stripped source, which is what `enrollment.ts` already does and what an
ad-hoc grep does not.
