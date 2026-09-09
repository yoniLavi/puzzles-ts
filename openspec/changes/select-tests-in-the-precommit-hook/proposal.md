# select-tests-in-the-precommit-hook

Owner-requested, 2026-09-09: *"Can we perhaps create our own minimal custom
harness around vitest related?"*

`measure-test-impact-selection` had just recorded that import-graph selection is
**unsound here** and adopted nothing. This change adopts it anyway — because the
gap that made it unsound turns out to be closable, and closing it is about forty
lines.

## Why the earlier "no" was only half an answer

That measurement asked whether `vitest related` is sound and correctly answered
no: on a game change it omits five glob-only guards, and on a `help/` change it
selects **nothing at all** against three guards that check those files. What it
did not ask is whether the missing channel is *derivable*.

It is. Every `import.meta.glob` call in the tree takes a **literal** pattern —
either a string or an array of strings — so the couplings a static graph cannot
see are nonetheless statically enumerable. The selector unions the two channels
and errs toward running more.

## What the selector does

`scripts/checks/select-tests.mjs` prints `ALL` or a list of test files:

1. **Import graph** — `vitest list --changed --filesOnly`, which reads git
   itself and so covers staged and unstaged alike (a superset of the commit).
2. **Glob reach** — every test whose `import.meta.glob` pattern points into a
   directory containing a staged path.
3. **`ALL` otherwise** — any staged path outside `src/`, `vite-plugins/` or
   `help/`; an empty union; or any error whatsoever.

**The glob channel matches by base directory, not by pattern.** A hand-rolled
matcher for Vite's glob syntax is a thing that can be subtly wrong, and subtly
wrong here means silently not running a guard — so the selector takes the
literal prefix before the first wildcard and asks whether the changed path sits
under it. `../games/**/*.ts` from `src/engine/` becomes "anything under
`src/games/`". That is coarser than the true pattern and only ever selects
*more*.

## Measured

| staged change | files selected |
| --- | ---: |
| a game's `render.ts` | **47** of 301 |
| a `help/` page | **6** (`vitest related` alone: **0**) |
| anything touching `vitest.config.ts` | **ALL** |

The 47 exceed `vitest related`'s 33 by exactly the glob-only guards the graph
missed — the soundness fix is visible in the number.

Earlier timings (on a box under heavy memory pressure, so treat as ratios not
seconds): a graph-only game selection ran in 62.5 s against the full suite's
123.4 s, and an app-shell change collapsed to 3.7 s.

## Why this is safe, and it is the argument the gate already accepts

**Hook only. CI is unchanged and runs everything on every push to `main`.**
That is precisely the existing, twice-blessed pattern: `biome check --staged` in
the hook against `biome ci .` in CI, and the documentation-only shortcut that
skips vitest locally while CI does not. A selector bug costs a slower feedback
loop, never a broken `main`.

`build-pipeline`'s rule that no correctness check may be *removed* is intact:
nothing is removed, and the whole suite still runs on the branch that matters.

## The guard that keeps it true

`src/test-selection.test.ts` fails the build when a test acquires a read channel
the selector cannot model — a computed glob pattern, or a direct `node:fs` read.
Same shape as `gate-scope.test.ts`, which keeps the documentation-only shortcut
honest for the same reason. **Verified to fail** by planting a computed pattern
and watching it go red.

## Two traps hit while building this, both recorded at the site

- **The array form of `import.meta.glob`.** A first pass established "all 39
  calls take a string literal" with a *line-oriented* grep — and both array-form
  call sites span several lines, so they were never examined. The guard caught
  it on its first run. Third instance this session of a scan keyed on the shape
  the author expected.
- **A block-comment stripper eats live code here.** A doc comment mentioning a
  glob pattern contains `**/*`, whose first two characters are `*` and `/`, so
  `/\/\*[\s\S]*?\*\//` terminates the comment *at the pattern* and consumes what
  follows. Added as a tidy-up, it silently dropped three help guards from a real
  selection. The selector now parses prose deliberately (it can only
  over-select) and the guard strips line-by-line.

## Impact

- Affected specs: `build-pipeline` — one `ADDED` requirement, and the previous
  change's "not adopted" requirement is `MODIFIED` to record that the condition
  it set has been met.
- Affected code: `scripts/gate.sh`, one new script, one new guard test. **No
  production code.**
- No dependency added.
