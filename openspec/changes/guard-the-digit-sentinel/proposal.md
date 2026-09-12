# guard-the-digit-sentinel

**Readiness: scaffolded, not started.** Scoped from a measurement taken
2026-09-12, after `share-the-desc-digit-fact`. Read `design.md` first: it
records why the larger refactor this started as was declined, so that a fresh
session does not re-open it.

## Why

`decimal.ts`'s `digitValue` and `desc-alphabet.ts`'s `c2n`/`c2nUpper` report
"not one of mine" as **`-1`**, a numeric sentinel the compiler does not make
anyone check. The owner asked the right question of that: in most languages an
untracked absent value is exactly the thing to avoid, and `number | undefined`
is the form TypeScript's narrowing actually enforces.

Measured across all 42 call sites, the sentinel is safe here, and for a reason
nothing in the tree states:

> **The sentinel is below the domain.** Every value these codecs return is
> `>= 0`, so any natural lower-bound test — `>= 0`, `>= 1`, a game's own
> `< 0 || > 4` — is *simultaneously* an absence test. `-1` fails all of them.

That is what makes 41 of the 42 sites correct, and it is load-bearing,
undocumented, and one keystroke from being false: **an equality test does not
inherit it.** `if (digitValue(c) !== 0)` would accept a letter as "not zero"
and no test in the tree would notice. No site does that today, which is
precisely why it would be introduced silently.

So the maintainability problem is real, and it is not the type. It is that the
property every call site depends on is written down nowhere and checked by
nothing.

## What changes

1. **State the invariant** where the two codecs are defined, as the reason for
   the sentinel rather than as a description of it: below the domain, so a
   lower-bound test is an absence test, and an equality test is not.
2. **Guard the one shape the invariant does not cover.** A source scan, keyed
   on shape rather than on a name, failing any equality comparison against a
   `digitValue`/`c2n`/`c2nUpper` result. Proved on a planted site before being
   trusted, per `AGENTS.md` § "Method".
3. **Collapse the repeated calls the sweep left.** Six sites call the codec two
   or three times on one line to test then use the same character:

   | Game | Calls on the line |
   | --- | --- |
   | Tracks, two sites | 3 each |
   | Seismic, Palisade | 2 each |

   Four others were collapsed while adopting; these survived. A bound reads as
   the game's own sentence when the value is named once.
4. **Record the declined alternative** in `design.md`, with the measurement, so
   the next reader of the `-1` does not re-derive it.

## What this does not do

- **It does not convert the sentinel to `undefined`.** See `design.md` D1. The
  short version: 26 of 30 `digitValue` sites are lower-bound tests that the
  conversion would make *more* verbose, not less, and the value is written
  directly into typed arrays whose own absent encoding is `-1` and cannot be
  anything else.
- **It does not touch a storage sentinel.** `Int8Array(...).fill(-1)` for "no
  clue" appears at 133 sites in `src/games/`. A typed array cannot hold
  `undefined`; this is a storage encoding, not a return convention, and a scan
  that swept it would be the wrong-key error `AGENTS.md` names.
- **It does not unify `-1` with `digitOf`'s `null`.** They sit in different
  layers with no call site in common, which `share-the-desc-digit-fact` D2
  already recorded as deliberate.

## Constraints

- **No behavior change at all.** Every frozen differential passes unedited and
  no narration moves; the only `src/` edits are a comment and six lines that
  name a value they already computed.
- **The guard must be shown to fail** before it is trusted, and must carry a
  vacuity count, since a scan over an unmatched glob passes over nothing.
