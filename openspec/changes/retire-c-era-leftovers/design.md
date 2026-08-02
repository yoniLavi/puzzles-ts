# Design — retire-c-era-leftovers

## D1. The test is "can a reader act on this?", not "does it mention C"

The tempting rule is *delete every mention of the C engine*. It is wrong in both
directions, and applying it would have cost real information.

`src/puzzle/drawing.ts` says a line's endpoint pixels are drawn *"copied from
upstream's emcclib.js"*, and `js_canvas_find_font_midpoint` explains why a font
metric is measured on a lowercase glyph. Neither sentence is about the C engine
this repo deleted — they are about **upstream's frontend, which still exists**,
and they are the only account of two otherwise arbitrary rules. `random/sha1.ts`
claims byte-equivalence with `puzzles/random.c`, which is the whole reason the
module is written the way it is and shared game IDs still reproduce.

So the line is drawn on **actionability**:

| kind | example | verdict |
| --- | --- | --- |
| provenance — where this came from | "TypeScript port of `puzzles/random.c`" | keep |
| absence guard — why the machinery is *not* here | `sentry.ts` on the removed `wasmIntegration()` | keep |
| dead instruction | `cmake -B build/native -S puzzles …` | delete |
| false statement in the present tense | "production is the unchanged all-WASM path" | rewrite |

The last two are what the owner's *"isn't relevant any more"* names. The first
two are relevant precisely *because* the C is gone: with no build to interrogate,
a comment recording where a behaviour came from is the only remaining answer.

## D2. The recipes are replaced, not repointed — and the reason is the trap

Thirty-seven differential headers name an output path under `src/native/games/`,
which `retire-native-directory` moved. The obvious fix — and the one a path sweep
would apply — is to rewrite it to `src/games/`.

**That is the worst available outcome.** The path is one dead line in a block
where *every* line is dead: `puzzles/` was deleted, the CMake tree was deleted,
`-DUSE_TS_RANDOM` no longer parses, `build/` was deleted, and
`scripts/build-native.sh` (which Loopy's recipe invokes) was deleted. Fixing the
one segment a grep can see would leave a recipe that looks maintained and fails
on its first line — strictly worse than the visibly-stale version, because a
reader would trust it.

Six of the thirty-seven already concede the point in their last line: *"After
deletion, recover the harness from git history."* That sentence is the whole of
what survives, and it is what the replacement says.

**What the replacement keeps:** the harness name (`<game>-trace`), because it is
the search key that makes `git log` actually find the thing; and, where a file
had one, its specific note (Slide's harness died in a named commit; Keen's,
Unequal's and Group's were pure-C harnesses under `puzzles/auxiliary/`).

**Where the "why" lives:** once, in `src/engine/testing/differential.ts`, which
33 of the 37 already import. Repeating six lines of explanation thirty-seven
times is the clone this repository's own rule warns about — *"import shared
things from where they live"*. The per-file note is two or three lines and is
self-sufficient about the one fact that matters (the fixture is frozen and cannot
be regenerated), so the four files that do not import the helper lose nothing.

## D3. `PuzzleEngineSurface` is C-era in origin and stays anyway

Its doc comment says it exists so that *"the dispatch seam in `worker.ts`
constructs either without an `as unknown as` cast"* — a two-implementation
problem, and there is one implementation. By origin it is exactly what this
change is sweeping.

It stays, for a reason that has nothing to do with its origin: the app types the
worker as `Remote<PuzzleEngineSurface>`. Without the interface that becomes
`Remote<TsWorkerPuzzle>`, which drags the concrete class's entire surface across
the worker boundary and makes every internal method look like part of the
contract. A narrowed, hand-stated boundary type is worth having with one
implementer.

`worker.ts` already records this decision in a comment. The defect is that
`engine-surface.ts` — the file the decision is *about* — still describes the
two-implementation world, so the two files contradict each other and the older,
wronger one is the one a reader opens first. Only the doc changes.

## D4. What proves a comment-only change did not break anything

Most of this is comments, where the check is that nothing changed. Two edits are
real, and each was chosen partly because it **fails loudly**:

- Removing `VITE_USE_TS_LEAVES` / `VITE_USE_TS_RANDOM` from `ImportMetaEnv`:
  `vite-env.d.ts` sets `strictImportMetaEnv`, so any surviving reader of either
  key is a `tsc` error rather than a silent `undefined`. (`tsc` is clean, so
  there are none — which is also the evidence they were orphans.)
- Removing the `scripts/diff-*.test.ts` entry from the vitest config: `npm run
  diff` reports its file count, so a wrongly-dropped entry shows up as 2 files
  instead of 3.

Beyond that: the full suite and `vite build`, and — because thirty-seven test
files are being edited — a check that the **assertion count is unchanged**, not
merely that the suite is green. A comment edit that accidentally swallowed a
`describe` would still leave a green suite with fewer tests in it, which is the
same silent-shrink shape the probe floor guards against in
`group-crowded-source-directories` D2.
