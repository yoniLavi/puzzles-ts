# unify-hint-refusals

## Why

`document-hint-feature` wrote, in `help/features.md` §Hints, that two different
things stop a hint and that a player must be able to tell which they are looking
at, "because they call for opposite responses". **That promise was unkeepable as
the collection stood.** Twenty-two games had invented **seventeen** phrasings
between them, and the same refusal wore two faces in games a player moves
between freely: "I can't find a deduction from here." (Dominosa, Palisade,
Slant) and "No further move can be deduced from this position." (nine others)
are one situation, worded twice.

That change deliberately handed this on rather than absorbing it — help
documentation is not the place to sweep twenty-two games — and recorded it in
its design as the follow-up this is.

**The measurement had to be redone before the work, and it changed the finding.**
The first count came from grepping `{ ok: false, error }` across the games tree,
which is also `SolveResult`'s shape: it counted Solve's failures and the
description parsers' as if they were hint refusals. Scoping properly gave 21
games and 17 strings.

**Then the scoped instrument was itself wrong**, in this repo's most familiar
way. It collected refusals from functions **named** `hint`, so it never saw
`netslideHint` — an entire game, missing from every figure it reported, and
carrying two divergent messages of its own. The guard this change ships keys on
the **shape** instead (`{ ok: false, error: <literal> }`, wherever it appears)
and is therefore a deliberate *superset* that also catches Solve and the
parsers; those are classified rather than filtered out, because filtering is how
the first two attempts went wrong.

## What Changes

- **`src/engine/hint-refusal.ts`**: one definition per message, and
  `commonHintRefusal(completed, mistakes)` for the two-line opening most
  deductive games share.
- **Twenty-two games import their refusals** instead of spelling them. No game
  keeps a private copy of an approved message.
- **A distinction that was being lost is now named.** `FIX_MISTAKES_FIRST` says
  "fix the **highlighted** mistakes", which is only true where the game has
  established there is something for `findMistakes` to light up. Bricks and
  Subsets have a *rule-validator* `findMistakes` that cannot see a
  wrong-but-legal entry — Bricks says so in a comment — so their extra messages
  are not spelling variants at all. Folding them into the generic one, which is
  what a wording sweep would have done, would have promised a highlight that
  never appears. They get `CONTRADICTION_UNLOCALISED`.
- **Untangle and Inertia keep their own words**, recorded with reasons: naming
  *their* specific dead end ("no single move reduces the crossings", "the ball
  is dead") is the whole value of a hint in a game with nothing to deduce.
- **`hint-refusal.test.ts`** fails on a new phrasing *and* on an inlined copy of
  an approved one, with a documented exception list that fails closed.
- **`docs/games/hints.md`** gains "Refusal wording comes from one module",
  including how to choose between the two mistake messages.

## Impact

- Affected specs: `ts-engine` (the Hint System requirement gains what a refusal
  must say).
- Affected code: `src/engine/hint-refusal.ts` (new), its test (new), 22 games,
  and five test files that asserted an old string.
- **Player-visible.** No board, solver or plan changes, but the words a refused
  hint shows do — which is the point, and is why this needs acceptance rather
  than being self-archived.
