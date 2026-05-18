## Context

This is the largest doctrine shift in the project's history: it
inverts the migration strategy and discards the fidelity bar that
every prior change was built around. It deserves a design doc not for
implementation complexity (it's docs-only) but to record *why* the
inversion is correct, so a future reader (or a session that loads the
old `pre-ts-pivot` tag) understands the reasoning rather than just the
outcome.

## The inversion, stated precisely

| Axis | Old doctrine | New doctrine |
|---|---|---|
| Role of C | Immutable byte-oracle; never edited | Readable reference + dev-time differential spot-check source |
| Fidelity bar | Byte-identical, characterization corpus per seam | Game plays correctly + spot-check vs C in dev |
| Order | Bottom-up: random → leaves → mid → drawing → games → midend | Top-down: midend + game interface → games (simple → Galaxies → outward) → leaf libs lazily as idiomatic TS |
| C deletion | Only when the *entire* rewrite is complete | Per game, as each TS game lands |
| Save / IDs | C-serialisation + historical game-ID compat | Clean TS save format; `random.ts` keeps *future* IDs stable; old saves/IDs expendable |
| Relationship to upstream | Faithful port; divergence is failure | Deliberate divergence is the point (hints, mistake-checks, aids) |
| Leaf libraries | Bridged seams with corpora | Ordinary idiomatic TS deps (dsf ≈ 20-line union-find; tree234 ≈ Map/sorted) |

## Decisions

### Decision: C stays as a dev reference, not deleted wholesale

Tempting alternative: delete `puzzles/` now and rewrite from scratch.
Rejected. The C generators/solvers encode years of subtle
puzzle-quality logic (uniqueness, difficulty grading, symmetry). That
knowledge is priceless as a *readable spec* and a *differential check*
even though it is no longer a *byte-oracle*. C-WASM also remains the
runtime for every not-yet-ported game (per-game hybrid), so it cannot
be deleted until the last game is ported anyway. The change is the
*role* of C (oracle → reference), not its presence.

### Decision: Doctrine lives in a spec, not just AGENTS.md prose

The old approach lived as prose in `AGENTS.md`. Prose doctrine is easy
for a future session to half-read or override. Codifying the new
approach as a `ts-migration` capability spec (requirements +
scenarios, strict-validated) makes it a checkable contract, consistent
with how `build-pipeline` / `puzzle-icons` already work. `AGENTS.md`
keeps a readable summary and points at the spec as authority.

### Decision: Retire add-benchmark-soak rather than reframe it in place

`add-benchmark-soak`'s entire premise is "prove the hybrid TS+C build
is byte-identical to pure-WASM." Once divergence is *intended*, that
assertion is not just unnecessary — it would *fail by design* the
moment a hint system or annotation overlay lands. A "every game still
generates a solvable board" playability soak is still valuable, but
it's a different artefact with a different corpus shape and gate. Cleaner
to remove the obsolete proposal (it never started) and let a future
playability-soak proposal be written fresh against the `ts-migration`
spec than to leave a contradictory proposal in the tree.

### Decision: Keep the umbrella flag runtime, drop it as *strategy*

`USE_TS_LEAVES` + the worker coherence check still work and are still
the right mechanism for "is this call C or TS." What changes is the
*unit*: the migration is now per-game, not per-leaf-library. A future
game port will likely want a per-game switch (`USE_TS_<GAME>` or a
catalog-level flag) layered on the same coherence-check pattern. That
design belongs to `ts-midend-and-game-interface`, not here. This
change only stops *describing* the per-leaf umbrella as the migration
plan.

## Risks / Trade-offs

- **Subtle generator bugs without byte-corpora.** Accepted per owner
  decision. Mitigation lives in the `ts-migration` spec: a dev-time
  differential harness that generates N boards from both the C build
  and the TS port for the same seed and surfaces diffs for review —
  weaker than a gating corpus, far cheaper, and tightenable per-game
  where puzzle-quality risk is high (e.g. games with hard uniqueness
  constraints).
- **Doctrine whiplash for future sessions.** A session that has the
  old `AGENTS.md` cached, or reads the `pre-ts-pivot` tag, may apply
  the dead doctrine. Mitigation: the rewrite is emphatic and dated;
  the `ts-migration` spec is the strict-validated source of truth;
  the legacy approach is clearly labelled as superseded on its
  branch/tag.
- **Sunk work.** The `USE_TS_LEAVES` umbrella + coherence check were
  built for the per-leaf model; under per-game they are lower-value
  (the coherence-check *lesson* — fail closed on flag mismatch —
  carries; the per-leaf machinery less so). `random.ts`,
  `drop-icon-generation`, the host-native build, the app shell, and
  drawing-in-TS all keep full value. Stated plainly rather than
  pretended away.

## Migration Plan

Docs-only; no runtime migration. Sequence:

1. Snapshot old approach (done: branch `legacy/seam-by-seam-fidelity`
   + tag `pre-ts-pivot`, pushed).
2. This change: rewrite `AGENTS.md`, `project.md`, `README.md`; add
   `ts-migration` spec; modify `build-pipeline` spec; retire
   `add-benchmark-soak`.
3. Next change (`ts-midend-and-game-interface`): build the TS midend
   + the `Game` interface + the per-game hybrid loader + the dev
   differential harness.
4. Then `port-cube-to-ts` (pattern-establishing), `port-galaxies-to-ts`
   (goal 4), quick-save, per-game `findMistakes()`/`hint()`, worker
   re-evaluation, remaining games outward.

Rollback: `git checkout legacy/seam-by-seam-fidelity`. Nothing in
this change is irreversible; it's documentation.

## Open Questions

- Per-game switch shape (`USE_TS_<GAME>` vs catalog-level vs
  build-time tree-shake) — deferred to `ts-midend-and-game-interface`.
- Whether the worker survives once games are TS — deferred; flagged
  in the `ts-migration` spec as an expected future re-evaluation.
- Whether any game ever wants its old byte-corpus back (a generator
  with brutal uniqueness constraints) — left as a per-game tightening
  option in the spec, not a global default.
