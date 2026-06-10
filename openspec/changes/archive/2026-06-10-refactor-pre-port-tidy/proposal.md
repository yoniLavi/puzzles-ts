# Change: Pre-port tidy — consolidate engine helpers, prune phantom API, repair spec drift

## Why
Four games are now ported (Flip, Galaxies, Pegs, Sixteen) and the next port is
about to start. A survey found verbatim duplication that the second-consumer
rule says to promote, a spec'd engine API with zero consumers, engine-module
tests stranded in game directories, and openspec drift from two hand-rolled
archive operations that put archives in the wrong place and never applied
their spec deltas. Cheapest moment to fix all of it is before the next port
copies the wrong patterns forward.

## What Changes
- **Full mkhighlight palette helper**: Pegs and Sixteen carry byte-identical
  ~30-line copies of upstream `game_mkhighlight`'s highlight/lowlight
  derivation after calling `mkhighlightBackground`. Promote the full palette
  derivation into `src/native/engine/colour-mkhighlight.ts` as
  `mkhighlight(bg)` returning `{ background, highlight, lowlight }`;
  `mkhighlightBackground` stays (Galaxies uses it alone).
- **Fix the near-extreme highlight/lowlight fallback** (found during
  consolidation, caught by the new property test): the duplicated inline
  code's `dw < K` branch produced `mix(white, black, K/√3)` — which equals
  the adjusted background, so on light hosts Pegs and Sixteen rendered their
  highlight bevels as near-background grey. Upstream `misc.c` saturates the
  highlight to pure white (and the lowlight to pure black) in that branch;
  the shared helper now does the same. This is a visible rendering fix on
  light themes — flagged for owner spot-check.
- **Shared `parseLeadingInt`**: copy-pasted in Flip and Galaxies param
  decoding. Promote to `src/native/engine/params.ts`.
- **Remove `PointerAction`/`parsePointerAction`** (and the supporting
  `PointerButton`/`CursorDirection` types) from `pointer.ts`: spec'd
  forward-looking in `extract-shared-helpers`, but two drag games (Galaxies,
  Sixteen) have since shipped without using it — zero consumers anywhere.
  Phantom API surface stays small. The button constants stay (all four games
  use them).
- **Relocate stranded engine tests**: `flip/sorted-multiset.test.ts` and
  `galaxies/dsf.test.ts` are the only tests for `engine/sorted-multiset.ts`
  and `engine/dsf.ts`; they were left behind when the modules were promoted.
  Move them to `src/native/engine/` per repo-layout's colocation rule.
- **Repair openspec archive drift** (done directly alongside this change —
  it restores the documented archive convention): `openspec/archive/
  {add-pegs-ts-port, add-sixteen-ts-port}` moved to
  `openspec/changes/archive/` with date prefixes.
- **Recover lost spec requirements**: the pegs archive never applied its
  delta (no Pegs requirement exists in `openspec/specs/` today), and the
  sixteen change's "delta" was a freeform doc that was never applicable.
  Backfill per-game `pegs` and `sixteen` capability specs (matching the
  flip/galaxies precedent), and migrate the two Sixteen-specific requirements
  that later changes added to `ts-engine` into the `sixteen` capability.
- **Refresh AGENTS.md**: "What's been done" stops at Galaxies; record the
  helper extraction, Pegs, Sixteen, the hint system, drag-to-slide, and
  hint plans, and mark the queued helper extractions done.

## Impact
- Affected specs: `ts-engine` (2 ADDED, 1 MODIFIED, 2 REMOVED-by-migration),
  `pegs` (new capability, recovered), `sixteen` (new capability, recovered +
  migrated)
- Affected code: `src/native/engine/{colour-mkhighlight,pointer,params,index}.ts`,
  `src/native/games/{pegs,sixteen,flip,galaxies}/index.ts`, test relocations
- Behaviour change is limited to the mkhighlight fallback fix above
  (highlight/lowlight on near-white/near-black hosts); param decoding and
  input handling are value-identical before and after, enforced by the full
  pre-commit gate plus the new direct helper tests.
