# share-the-run-length-desc-scanner

**Readiness: measured, but size it on two games before committing to a shape.**
The duplication is verified by reading; what is not yet verified is how much of
it survives extraction, because the grammar is interleaved with each game's own
clue validation. Task 0 answers that on two games and then decides.

Found 2026-09-06 by `declare-the-board-model`'s exploration, which was withdrawn
(`openspec/postmortems/2026-09-06-board-model-withdrawal.md`). The board model
promised "the desc codec for the common run-length grammars"; that promise was
the one deliverable on its list that has shipped in no form. It does not need a
topology declaration — it needs a scanner.

## The finding

**One grammar, four spellings, and every game writes it twice.**

Measured 2026-09-06 over every function in `src/games/` whose body maps a run to
a letter or a letter back to a run (the scan was keyed on that shape, not on a
name — 30 games matched):

**One dialect dominates** — `'a'` is a run of 1, chunked at 26 — written four
different ways:

| Spelling | Games |
| --- | --- |
| `String.fromCharCode(96 + run)` | bridges, crossing, map, mathrax, mosaic, salad, slant |
| `String.fromCharCode(97 + run - 1)` | bricks, boats, filling, loopy |
| `String.fromCharCode(97 - 1 + currrun)` | keen |
| `String.fromCharCode(A - 1 + run)`, `A = "a".charCodeAt(0)` | palisade |

Two genuine outliers, which the shared form must **not** try to absorb:

- **unruly** — `'a'` is a run of *0*, with a second uppercase alphabet for the
  other cell color and a `> 24 / -= 25` flush.
- **magnets, samegame, singles** — not run-length at all, but base-36/62 *value*
  codecs (`n2c` / `c2n`). Singles' and magnets' are near-identical to each
  other, which is a separate, smaller finding.

**And the grammar is written twice within a single game.** `validateDesc` scans
the desc to count squares; `newState` scans it again to fill them; each carries
its own copy of the a–z arithmetic. Palisade, Mosaic, Bricks, Boats, Tents,
Towers, Tracks, Pattern and Pearl all do this. **That intra-game duplication is
the sharper target** — it is two copies of one grammar inside one file, which is
the `AGENTS.md` "one function, both callers" shape applied to a codec.

## Why

A desc format is a **player promise** — a shared game ID must decode forever —
and this is the one place in the collection where the promise is kept by two
independent hand-written scans agreeing with each other. Palisade's
`validateDesc` rejecting a desc that its `newState` would have parsed (or worse,
accepting one it would misparse) is a save-corrupting class of bug that nothing
currently guards.

Extracting one scanner both read is what makes the two agree by construction.

## The shape to try

A scanner, not a codec — the grammar only, leaving every game its own clue
semantics:

```ts
for (const tok of scanRunLength(desc)) {
  // tok is { gap: n } | { value: ch }
}
```

Palisade is the sizing exemplar. Today:

- `validateDesc`: 16 lines, of which the grammar is ~5 and the rest is
  Palisade's own rule (a clue may not exceed 4, the total may not exceed `w*h`).
- `newState`: 22 lines, of which the grammar is ~5.

So the extractable core per game is small; the question task 0 must answer is
whether the *remaining* per-game half reads better or worse once the scan is
inverted into a loop over tokens.

## What must not move

**Every existing desc is frozen, byte for byte.** This change may not alter one
byte of any `params:desc` id, which is what the frozen differentials are the net
for. A game adopts only when its differential is byte-clean afterwards.

The encoder is a second, independent question and should be sized separately —
four spellings of one expression is a cosmetic finding on its own, and
`AGENTS.md` is explicit that tidiness is not a reason to diverge. **The reason
to touch the encoder at all is that it belongs beside the scanner its output
must satisfy**, not that `96 + run` and `97 + run - 1` look different.

## Impact

- Affected specs: `ts-engine` (a new shared helper), if the sizing supports one.
- Affected code: a new `src/engine/run-length.ts`, plus the adopting games'
  `state.ts`.
- **No player-visible change of any kind.** If a differential moves, the
  extraction is wrong; that is the whole acceptance test.
