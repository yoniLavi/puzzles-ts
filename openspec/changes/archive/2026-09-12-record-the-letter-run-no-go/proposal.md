# record-the-letter-run-no-go

## Why

`share-the-desc-digit-fact` shared *which character is a digit*. The obvious
next extraction is its sibling — *which letter stands for a run of N blanks* —
and it looks identical from a distance:

| | |
| --- | --- |
| games writing or reading a letter run by hand | 26 |
| sites | ~69 |
| games already on the shared scanner (`run-length.ts`) | 8 |

Measured 2026-09-12. That is a larger population than the digit fact had, in a
tree that has just finished proving such populations are worth collapsing. **A
future reader will find this same grep and reach the same conclusion**, which
is why the measurement needs a home rather than a mention in a reply.

## What the measurement found

**The 26 games genuinely disagree, and the disagreement is about their descs.**

| Convention | Games |
| --- | --- |
| `a` = 0 | Clusters |
| `a` = 1 | Sticks, Range, Ascent, and most others |
| `a` = 2 | Tents |
| chunk at `> 24` / `> 26` / `>= 26` | Clusters / Sticks, Range / Ascent |
| `z` is a full run of 26 | most |
| `z` is a *continuation* marker, adding 25 and not ending the run | Tents, Clusters |

Ascent goes further: its `flushRun` takes the run's **base letter as an
argument**, because one desc carries three run alphabets (blank, wall, number)
distinguished by case and start.

That is `AGENTS.md` § "Convention over configuration"'s own test answered in the
affirmative: *can we say what a game would legitimately want to do
differently?* Yes — each of these descs is frozen bytes, and an encoder must
agree with the decoder that reads the boards already shared. A shared helper
would need `base`, `chunk` and `zMeaning` as parameters, which is three knobs
plus a seam: the "two ways plus a seam" that `run-length.ts`'s own header
refuses.

**This is also why `run-length.ts` declined these games in the first place.**
Its header says the key is not "does it write `charCodeAt(0) - 97`" but "is
everything that is not a blank run a single value character". That is the
*grammar* test. What it does not say, and what this change adds, is that the
**alphabet underneath the grammar diverges too** — so the smaller extraction
that would survive the grammar objection does not survive either.

## What changes

Nothing in `src/`, deliberately. The measurement is recorded where the next
person to run that grep will meet it:

- `src/engine/run-length.ts`'s header — the alphabet paragraph, with the date
  and the count, beside the grammar paragraph that already refuses these games.
- `docs/games/engine-catalog.md` § `run-length.ts` — the same, in the menu a
  game author reads before re-rolling something.

## Why this is not a postmortem

`openspec/postmortems/` holds directions **tried and dropped** — work that was
started and reversed. This was measured and declined before any code moved,
which is the `refactor as you go` directive's "record the no-go with its
reason", and the `unify-hint-framework` archive is the pattern it names.
