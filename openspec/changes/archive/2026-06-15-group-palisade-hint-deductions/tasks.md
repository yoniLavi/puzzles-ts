# Tasks

## 1. Solver: tag forced edges by firing
- [x] 1.1 Add `group: number` to the `ForcedEdge` interface (`solver.ts`).
- [x] 1.2 Add a firing counter + `firing(fn)` helper to `SolverCtx`: `firing`
      bumps the counter and runs `fn` so every edge recorded inside shares the
      group id; a recording made outside a firing gets its own fresh group.
      `recordEdge` stamps the current group.
- [x] 1.3 Wrap `equivalentEdges`'s pair (`connectEdge`/`disconnect` of `dirj` +
      `dirk`) in one `firing(...)`; wrap each multi-edge sweep in
      `numberExhausted` (the "all walls placed" and "every remaining is a wall"
      inner loops) in one `firing(...)` per clue cell.
- [x] 1.4 Remove the now-redundant per-edge `siblings` evidence plumbing
      (`ctxJ`/`ctxK` in `equivalentEdges`); keep `cells` (region / clue).
      `deduceForcedEdges` keeps its flat return + physical-edge dedup; a
      firing's surviving edges stay contiguous.

## 2. Hint: group firings into journeys + narration
- [x] 2.1 In `index.ts` `hint()`, split the flat forced-edge list into
      contiguous runs of equal `group`; emit one journey per run — leg 0
      unflagged, legs `> 0` with `continuesPrevious: true`.
- [x] 2.2 Derive each leg's sibling highlights from the group (the firing's
      edges at index `> leg`); keep `cells` shared across the group.
- [x] 2.3 Rework `explain()` to take `(fe, clues, w, legIndex, groupSize)`:
      continuation legs get short kind-specific text; first leg of a multi-edge
      `equivalentEdges` firing states the "share a fate" coupling; first leg of
      a multi-edge `numberExhausted` firing phrases the "all remaining edges"
      conclusion. Wording is concise and order-agnostic (no "this edge then the
      other") since the edges are now indistinguishable. Single-edge groups keep
      the existing per-rule wording.
- [x] 2.4 `render.ts`: paint every forced edge of the firing in `COL_HINT`
      (merge the sibling edges into the action hint-edge mask); delete the orange
      `COL_HINT_SIBLING` colour, the `sibCache` sidecar, and the `sib` threading
      through `edgeColour`/`drawTile`.
- [x] 2.5 `puzzle.ts`: replace the auto-hint loop's `animMs + 100` dwell with a
      uniform shared `AUTO_HINT_STEP_MS` (1s) floored by the move's own
      animation (`max(animMs, AUTO_HINT_STEP_MS)`). Supersedes the per-game
      pacing of `d6d6d51` (owner chose uniform 1s).

## 3. Tests
- [x] 3.1 `palisade.test.ts`: a unit test that a multi-edge firing yields one
      journey — a contiguous run with the first leg unflagged and the
      continuation leg(s) `continuesPrevious === true`, the start surfacing
      siblings; the existing chain-solves test still passes.
- [x] 3.2 `palisade.test.ts`: assert the `equivalentEdges` first-leg explanation
      states the coupling ("share a fate") and its highlights carry a sibling
      edge + a multi-cell region.
- [x] 3.3 `palisade-render-scenario.test.ts`: tighten the `equivalentEdges` scan
      predicate to require a region reference (`hl.cells.length > 1`) so it no
      longer stops on a `numberExhausted` (single-clue-cell) frame; keep the
      op assertions; re-baseline the opener snapshot (now a grouped frame).
- [x] 3.4 Existing forced-edge tests updated for the `ForcedEdge.group` field
      and the removed solver `siblings` (highlights now derive from the group).

## 4. Spec + docs
- [x] 4.1 Apply the `ts-engine` delta (the grouping convention) and the
      `palisade` delta (multi-leg journeys) — drafted under
      `changes/group-palisade-hint-deductions/specs/`.
- [x] 4.2 `openspec validate group-palisade-hint-deductions --strict` — passes.

## 5. Verify
- [x] 5.1 Full gate: `tsc -b --noEmit`, `biome lint`, `vitest run` (1090
      passed). `vite build` runs in the pre-commit hook (needs wasm assets).
- [x] 5.2 In-process render-scenario verify: reached the equivalentEdges frame,
      eyeballed the composited SVG (both forced edges blue, no orange, over the
      shaded region + clue), and confirmed the concise "share a fate" narration.
- [x] 5.3 Owner acceptance — owner ran their own dev server and accepted the
      grouped journey, both-blue colouring, concise narration, and uniform 1s
      auto-hint pacing (2026-06-15). Commit + archive.
