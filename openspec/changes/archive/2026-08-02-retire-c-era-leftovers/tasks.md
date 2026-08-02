# Tasks — retire-c-era-leftovers

Ordered so the two edits that can actually break something land first, while the
tree is otherwise untouched and a failure is unambiguous.

## 1. Dead configuration

- [x] 1.1 Delete `VITE_USE_TS_LEAVES` and `VITE_USE_TS_RANDOM` from
      `ImportMetaEnv` in `src/vite-env.d.ts`, with their comments.
- [x] 1.2 `npm run typecheck`. Under `strictImportMetaEnv` a surviving reader of
      either key is a compile error, so a clean run is the evidence they were
      orphans (D4).
- [x] 1.3 Drop the `scripts/diff-*.test.ts` entry from
      `scripts/diff.vitest.config.mts`, and cut the paragraph explaining why the
      glob was kept. Record the *fact* (the live per-game differentials went with
      their ports; the frozen ones run in the gate) in one sentence — that part
      is still worth saying, it just is not a config entry.
- [x] 1.4 `npm run diff` still reports **3 files, 3 tests**.

## 2. The canonical note, once

- [x] 2.1 Add to `src/engine/testing/differential.ts` the paragraph the 37
      per-file recipes are collapsing into: what the fixtures are, that they were
      captured by per-game `*-trace` harnesses against upstream's C under the
      Emscripten/CMake build, that `retire-c-engine` deleted all of it, and that
      a divergence therefore **retires or re-founds** a fixture rather than
      re-recording it (the one-way-door consequence `AGENTS.md` already states).

## 3. The 37 recipes

- [x] 3.1 Replace each recipe block with a two-or-three-line frozen-fixture note.
      **Do not repoint the output path** (D2) — every other line of the block is
      equally dead, and a half-fixed recipe is worse than a visibly stale one.
- [x] 3.2 Keep, per file: the harness name (`<game>-trace`, the `git log` search
      key) and any file-specific fact — Slide's harness died in a named commit;
      Keen's, Unequal's and Group's were pure-C harnesses under
      `puzzles/auxiliary/`; `grid-incentre.test.ts`'s note that its fixture is
      deliberately separate from the incidence differential's is **not** part of
      a recipe and must survive.
- [x] 3.3 Verify the edit touched only comments: every changed line in the diff
      begins with `*` or `/*`, and no `+`/`-` line contains `describe`, `it(`,
      `expect` or `import`.
- [x] 3.4 **Assert the assertion count is unchanged**, not merely that the suite
      is green (D4). A comment edit that swallowed a `describe` leaves a green
      suite with fewer tests in it — the silent-shrink shape again.

## 4. False statements in the present tense

- [x] 4.1 `src/puzzle/puzzle.ts` — the class doc says "Public API to the remote
      WASM puzzle module" and "async methods for calling WASM Frontend APIs".
- [x] 4.2 `src/puzzle/engine-surface.ts` — describes two implementations, one of
      which was deleted, and so contradicts the decision `worker.ts` already
      records (D3). Interface unchanged; doc rewritten to state what it is now
      and why it survives with one implementer.
- [x] 4.3 `src/games/index.ts` — "Until a game is registered the registry is
      empty and production is the unchanged all-WASM path".
- [x] 4.4 `scripts/new-game-port.sh` — the printed checklist points a new
      contributor at "the C trace". Nothing to trace.

## 5. Specs and close-out

- [x] 5.1 `repo-layout` — the rule that a comment stating a *procedure* is
      executable or is marked as history, added to the requirement that already
      governs the differential shape.
- [x] 5.2 Sweep the pending changes for anything this invalidates, and
      `openspec validate retire-c-era-leftovers --strict`.
- [x] 5.3 Full gate, then owner acceptance, then archive. **Accepted 2026-08-03.**

## 6. Found while implementing

- [x] 6.1 **Five files the survey did not predict**, all found by widening the
      grep past the word "regenerate":
      - `lightup-differential.test.ts` phrases its recipe as *"Fixture recorded
        by … :"*, and `slide-differential.test.ts` as *"can no longer be
        regenerat**ed** in place … then:"* — neither matched the sweep's
        `\bregenerate\b`, which is the ordinary cost of matching on a verb.
      - The **three engine grid differentials** carry theirs as an inline
        parenthetical (`(regenerate with \`build/native/auxiliary/grid-trace
        --all\`)`) rather than a block, so the paragraph-scoped transform could
        not have touched them.
      - `spectre.test.ts` names `build/native/auxiliary/grid-trace …` as the
        source of a recorded value — provenance, so re-worded to the past tense
        rather than deleted.
- [x] 6.2 **`spectre-tables.ts` was a file nobody could legally change.** Header:
      *"GENERATED FILE — do not edit by hand. Regenerate with:"* over three
      commands of which every one is dead — including
      `node scripts/gen-spectre-tables.mjs`, a script that does not exist. So the
      instruction forbade hand edits and offered no alternative.
      **Checked before rewriting the header**: the generator's doc said it
      "re-asserts the structural invariants the tiling engine relies on
      (contiguous edge partitions, all `hexin` entries internal, `specin_S` the
      only table with external entries)" — an assertion that would have died with
      it. It did not: `spectre.test.ts` asserts all three directly (its own
      header says so). Nothing was lost; had it been, that would have been the
      real finding, and it is now a spec scenario.
