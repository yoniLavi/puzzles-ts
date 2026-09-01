# typecheck-the-build-side

## Why

`tsconfig.json` says `"include": ["src"]`, so **the gate's typecheck has never
seen the build**: `vite.config.ts`, `vitest.config.ts`, `vite-plugins/` and the
four advisory tests under `scripts/checks/`. The gate runs `tsgo -b --noEmit`,
which reads that one project, so those files are checked by nothing at all —
not the gate, not CI, not `npm run typecheck`. Only the editor notices, against
its own fallback options, which is why the first symptom was a diagnostic
claiming `Object.hasOwn` needs ES2022 in a repo that targets ES2022.

This is the file that renders **every help page and every static entry**.

Found while adding a build-time check to `extra-pages.ts` in
`document-hint-feature`, and deliberately not folded into it: that change was
help documentation, and widening it into a build-config change would have been
scope creep. Handed over instead, with the cost measured (28 errors).

**Two of those errors were real, and both had been sitting in the build:**

- `build.rollupOptions.output.validate: true` — a **rollup** option. Vite 8
  bundles with **rolldown**, which neither declares nor reads it: it is not in
  rolldown's option schema and appears nowhere in its runtime. The option has
  been doing nothing since the vite 8 upgrade, silently, because nothing
  typechecked the file that sets it.
- `defineConfig(async …)` failed to match any overload — which turned out to be
  a *consequence* of the two unknown properties below it, and cleared when they
  were resolved. Worth recording: an overload error on a config's outermost call
  is often the innermost property talking.

**And one looked real and was not**, which is the more instructive half.
`esbuild.supported` (the Safari top-level-await workaround, inherited from
puzzles-web) is absent from Vite 8's `ESBuildOptions`. The tempting reading is
"dead option, delete it" — the same conclusion `validate` deserved. It is wrong:
vite's *implementation* still forwards it, building
`supported: { ...defaultEsbuildSupported, ...esbuildOptions.supported }` from
`config.esbuild`. The type is narrower than the behaviour. **Deleting it would
have removed a live workaround for a WebKit module-graph bug on the strength of
a type**, so the fix declares what vite forwards rather than dropping what it
declares.

## What Changes

- **`tsconfig.node.json`**, a second project for the build-side files, with the
  *same* strictness and a Node runtime. It is separate rather than merged
  because `tsconfig.json`'s browser shape is load-bearing: `"types": []` is what
  keeps `node:fs` out of the app's type world, and several tests read source
  through `import.meta.glob` specifically to stay inside it.
- **The gate and `npm run typecheck` run both projects.** A step nobody has seen
  fail is not known to work, so this one was broken deliberately and watched.
- **`output.validate` deleted** — a dead option, retired rather than repointed.
- **`esbuild.supported` declared** via a narrow module augmentation, with the
  evidence for why it is live recorded beside it. Declared rather than cast: an
  assertion on the whole `esbuild` object would stop checking every other key in
  it, and the gap is one property.
- **`TransformData`'s five well-known keys declared.** The plugin documented
  `sourceFile` / `source` / `urlPathname` / `html` in prose and typed the bag as
  `Record<string, unknown>`; declaring them turns that comment into a contract a
  typo cannot slip past, and removes 12 of the 24 mechanical errors without
  bracket noise.
- The remaining mechanical accesses (`env.VITE_*`, `process.env.VITEST_*`)
  become indexed, conforming to the flag the rest of the tree already runs under.

## Impact

- Affected specs: `build-pipeline` (what the gate's typecheck covers).
- Affected code: `tsconfig.node.json` (new), `scripts/gate.sh`, `package.json`,
  `.github/workflows/ci.yml` (a comment naming `tsc` where the gate runs
  `tsgo`), `vite.config.ts`, `vitest.config.ts`, `vite-plugins/extra-pages.ts`.
- **No app behaviour changes.** The one runtime difference is the removal of an
  option that had no runtime effect; `vite build` output is unchanged.
