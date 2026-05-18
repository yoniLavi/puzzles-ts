# Change: Pivot to top-down TS migration; C becomes a reference, not an oracle

## Why

The project's entire doctrine — `AGENTS.md` "Goal/Approach/Upstream
policy/Test discipline/Seam order/C is never deleted" — was built to
guarantee one thing: byte-identical fidelity to upstream C across a
multi-year seam-by-seam port. After working the codebase, the owner's
four actual goals are: (1) fast HMR iteration on the web UI and games,
(2) easily adding new games without C's low-level ceremony, (3) cross-
game features upstream lacks (quick-save, mistake-check, explained
hints), (4) per-game gameplay aids upstream lacks (e.g. Galaxies
cell↔dot marking).

Three of those four are *fought* by the existing doctrine:

- The seam order is **bottom-up** (random → leaf libs → mid → drawing
  → games → midend). Every owner goal lives at the *top* of the stack
  (midend + specific games + new features). The plan delivers
  user-visible value last.
- The fidelity doctrine (byte-identical, characterization corpora per
  seam, save-game + historical game-ID compat) is a ~2× per-seam cost
  multiplier buying a guarantee that **directly conflicts** with goals
  3 and 4 — those goals are *deliberate divergence* from upstream. You
  cannot hold "byte-identical to upstream forever" and "add hints and
  annotation overlays Galaxies never had" simultaneously.

Owner decisions taken (2026-05-18) that unlock the simpler path:

1. Old save games and old/shared C-build game IDs are **expendable**.
   `random.ts` stays bit-identical so *future* IDs remain stable; a
   clean TS save format replaces C-serialisation compat.
2. The byte-identical corpus gate is replaced by **dev-time
   differential spot-checks** against the C build. Accept small
   generator-bug risk for ~2× velocity; tighten per-game only where
   it matters.
3. Target is still **all ~40 games eventually**, reordered top-down,
   without the fidelity doctrine.

## What Changes

This change is documentation + doctrine only — no runtime code. It
rewrites the project's durable context to the new approach and retires
the now-obsolete artefacts.

- **`AGENTS.md`** — rewrite the doctrine sections. C is reframed from
  "immutable byte-oracle" to "readable reference + dev-time spot-check
  source." Seam order inverts to top-down (midend + game interface
  first; games simplest→Galaxies→outward; leaf libs lazily, as
  idiomatic TS, on demand). "C is never deleted until the *whole*
  rewrite is complete" becomes "C deleted *per game* as each TS game
  lands." Test discipline drops characterization corpora; keeps a
  dev-time differential spot-check + ordinary behavioural tests. The
  "Upstream policy" section keeps the no-merge stance but drops the
  byte-oracle framing. "What's been done" gains a pivot entry.
- **`openspec/project.md`** — update Important Constraints + the
  lineage/strategy framing to match.
- **`README.md`** — rewrite almost entirely. New status + structure +
  contribution framing around top-down TS; the build section keeps the
  per-game-hybrid story but drops the per-leaf-umbrella-as-strategy
  framing.
- **New `ts-migration` capability spec** — codifies the top-down
  approach, the per-game hybrid, the spot-check discipline, the
  per-game C deletion, and the "deliberate divergence is allowed"
  stance as requirements + scenarios. This becomes the authoritative
  home for the approach; `AGENTS.md` prose points at it (as it points
  at `build-pipeline` / `puzzle-icons`).
- **`build-pipeline` spec — MODIFIED.** The umbrella requirement's
  "future bridges ship default-on by inheriting; per-seam proposals
  SHALL document the fidelity bar (corpus replay green + property
  tests)" clause is obsolete (no more corpora; hybrid is per-game,
  not per-leaf). Reword to the per-game-hybrid model. The umbrella
  *mechanics* (`USE_TS_LEAVES`, coherence check) still function and
  stay documented — they just stop being the migration strategy.
- **Retire `add-benchmark-soak`.** Its premise — a byte-identical
  hybrid-vs-pure-WASM soak — is meaningless once we have *chosen* to
  diverge. The proposal never started (0/25). Remove it; a
  playability soak ("every game still generates a solvable board")
  can be re-proposed later in the new framing if wanted.

**Out of scope** (deliberately not in this change):

- Building the TS midend / game interface. That's the next change
  (`ts-midend-and-game-interface`), gated on this doctrine landing.
- Porting any game. Top-down ports follow the midend.
- Touching `random` spec (random.ts stays correct as-is) or the
  umbrella *runtime* code (it still works; only its strategic
  framing changes).
- Deleting any C. C deletion is per-game, and no game has been
  ported under the new model yet.

## Impact

- **Affected specs**: `ts-migration` (ADDED — new capability);
  `build-pipeline` (MODIFIED — drop corpus-fidelity language from the
  umbrella requirement, reframe for per-game hybrid).
- **Affected docs**: `AGENTS.md` (≈ symlinked `CLAUDE.md`),
  `openspec/project.md`, `README.md`.
- **Retired**: `openspec/changes/add-benchmark-soak/` (removed).
- **Affected code**: none. No runtime behaviour changes; the umbrella
  flag infra is untouched and still works.
- **Preserved**: the seam-by-seam approach is snapshotted on branch
  `legacy/seam-by-seam-fidelity` + tag `pre-ts-pivot` (pushed) in
  case of reversal.
- **Risk**: low for *this* change (docs only). The strategic risk of
  the new approach (subtle generator bugs without byte-corpora) is an
  accepted trade per the owner decision and is mitigated by the
  dev-time differential spot-check in the `ts-migration` spec.
- **Verification**: `openspec validate --specs --strict` passes;
  `tsc -b --noEmit` + lint + tests still green (no code touched);
  `openspec list` shows `add-benchmark-soak` gone.
