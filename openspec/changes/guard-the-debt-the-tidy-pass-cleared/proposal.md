# Make three checks that exist actually catch something

## Why

`archive/2026-09-12-tidy-the-code-after-the-port` removed 11,330 lines of dead
comments, dead exports and dead citations by hand, one agent per directory.
Nothing stops it accumulating again, and three mechanisms that would are already
in the tree, each catching nothing:

1. **The citation guard scans the wrong population.** `change-citations.mjs`
   carries `const SCANNED = /^(docs\/.*\.md|AGENTS\.md)$/`, so a change id
   written in a source comment is invisible to it.
2. **knip is installed and wired to nothing.** It is a devDependency and no
   script runs it.
3. **The complexity rule is configured never to fire.**
   `noExcessiveCognitiveComplexity` is set to `maxAllowedComplexity: 150`, where
   biome's default is 15, and nothing in the tree reaches 150.

## What the measurements changed

Every one of the three was scaffolded with a number, and **two of the three
numbers were wrong in the same way** — the instrument was capped or blind, and
reported health over a scan of nothing. That is the defect this change is about,
arriving in the change's own evidence.

**The citation measurement held.** `src/**/*.ts` carries 63 kebab tokens across
57 files, 53 resolving — `docs/`'s ratio, not the specs'. The scan is widened,
the ledger gains seven entries of product vocabulary, and the guard is proved red
on a planted dead citation in a `.ts` comment.

**knip does not work in this repository, and its zero was the proof.** At the
pinned 6.31.0, with a config naming the real entry points, it reports zero unused
exports and cannot trace a symbol imported on the first line of `src/main.ts`.
This tree writes every import with a `.ts` specifier; knip's resolver does not
follow those, so its graph stops at each entry file. Written properly, the check
reports **373**. The dependency is removed and the check ships as
`npm run dead-exports`; 373 is a wall, so `retire-the-dead-exports` clears the
backlog before it becomes a gate step.

**The complexity table was read through biome's 20-diagnostic cap.** Its "152
diagnostics, 20 sites, 14 non-test" at threshold 50 is the cap showing through —
every threshold from 15 to 100 reported exactly 20. Uncapped: 876 at 15, 154 at
50, 26 at 100, 6 at 130, 0 at 150. The claim that the sites are "every one in
`engine/grid/` or `divvy.ts`" is also the cap: they are spread over seventeen
files, and they are the `interpretMove`, `redraw` and solver loop of a dozen game
ports — inherent shape, not debt. The ceiling goes to 130, where six sites stand
and each is accepted at its site with its reason.

## What this is not

Not a license to delete the complex functions. Grid geometry and a deduction
ladder are branchy because they are. The rule's value is that a *new* function
of that size has to be argued for.

And not a claim that the three numbers it started from were carelessly taken.
Two of them were taken with a tool that answers a slightly different question
than the one asked, silently — which is why `AGENTS.md` § "Method" says to check
the instrument against something outside the tool, and why each of the three
above is now recorded with how it was measured.
