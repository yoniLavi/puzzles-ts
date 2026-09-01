# Tasks — typecheck-the-build-side

- [x] 1.1 Measure first, per `build-pipeline`'s "strictness is adopted on
      measured evidence": **28 errors** — 24 `TS4111` (mechanical), 2 `TS2353`
      (unknown properties), 1 `TS2769` (overload), 1 `TS2339` (a `src` module
      pulled in without `vite/client` types).
- [x] 1.2 `tsconfig.node.json`: extends the root config, keeps every strictness
      flag, swaps the runtime (`types: ["node", "vite/client"]`). Separate
      project rather than a widened `include`, because the app's `"types": []`
      posture is load-bearing.
- [x] 2.1 **`output.validate` retired.** Verified dead before deleting: absent
      from rolldown's option schema and from its runtime. Not repointed — there
      is nothing to repoint it to.
- [x] 2.2 **`esbuild.supported` kept and declared.** Verified *live* before
      keeping: vite's runtime spreads `esbuildOptions.supported` into the
      transform options. A narrow `declare module "vite"` augmentation, so the
      rest of the `esbuild` object stays checked and a future vite declaring the
      key conflicts loudly.
- [x] 2.3 The `defineConfig` overload error cleared once 2.1 and 2.2 landed — it
      was the unknown properties, reported at the outermost call.
- [x] 2.4 `TransformData`'s five documented keys declared, turning the prose
      contract into a checked one and clearing 12 errors without bracket noise.
- [x] 2.5 The remaining `env.VITE_*` / `process.env.VITEST_*` accesses indexed.
- [x] 3.1 Gate wired: `scripts/gate.sh` and `npm run typecheck` run both
      projects. The stale `tsc -b --noEmit` in the CI workflow's comment
      repointed to what the gate actually runs (`tsgo`).
- [x] 3.2 **Proved the new step fails**: mistyped a plugin constant, watched
      `tsgo -p tsconfig.node.json` report it, restored.
- [x] 3.3 `vite build` green and `dist/` unchanged in shape (57 pages, 32 JS
      chunks) — the removed option had no output effect, as established.
- [x] 4.1 Full gate green.
- [x] 4.2 Self-archived: internal build configuration, no player-visible
      surface, decided and defended here.
