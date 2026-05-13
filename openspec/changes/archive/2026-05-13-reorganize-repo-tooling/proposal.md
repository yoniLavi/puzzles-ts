# Change: Consolidate build outputs, move tooling out of repo root, drop Wrangler

## Why

Three small frictions in the repo root accumulate to real navigation cost as
the rewrite expands:

1. **Two `build/` dirs with the same name, different purposes.** The recent
   Docker-removal landed `/build/{emcc,icons}/` for wasm/icon artefacts.
   Native characterization harnesses (e.g. `random-trace`) compile into
   `/puzzles/build/`. Both are gitignored, but on disk and in docs the names
   collide. PLAN.md and the archived `port-random-to-typescript` change both
   reference `puzzles/build/` directly. As more seam harnesses ship, the
   ambiguity gets worse, not better.
2. **Root-level Vite plugins and HTML templates.** `vite-extra-pages.ts` and
   `vite-wasm-sourcemaps.ts` live next to `vite.config.ts`. Templates
   `index.html.hbs`, `puzzle.html.hbs`, `_headers.txt.hbs`, and
   `unsupported.html` also live at the root. None are app source or
   configuration in the usual sense — they're build inputs the Vite pipeline
   consumes. They clutter root listings and aren't co-located with what
   imports them.
3. **Wrangler + Cloudflare Pages config we don't ship.** PLAN.md records the
   CF Pages workflow as disabled in this fork. `wrangler.toml`, the
   `wrangler` devDep (~big install), and the `preview:pages` npm script are
   all dead weight here. The user has confirmed CF Pages is no longer the
   plan.

All three are pure housekeeping — no behaviour change, no spec change beyond
where files live.

## What Changes

### 1. Consolidate build outputs under `/build/`

- `/build/emcc/` → `/build/wasm/`. The directory holds Emscripten output but
  the user-facing name should describe the artefact ("wasm"), not the
  toolchain ("emcc"). Keeps the rename portable if the toolchain ever
  changes.
- `/build/icons/` stays.
- `/puzzles/build/` → `/build/native/`. Characterization-harness binaries
  (random-trace, plus the upstream `auxiliary/*-test.c` programs we will
  port) now share one parent with the wasm and icon outputs. The CMake
  source root stays at `puzzles/`; only the `-B` directory changes.

After this, `/build/` is the single home for every generated artefact in
the repo:

```
/build/
  wasm/      # Emscripten output → src/assets/puzzles/
  icons/     # GTK screenshots → src/assets/icons/
  native/    # Characterization-harness binaries (CLI-only, on host)
```

### 2. Move root-level Vite plumbing

- `vite-extra-pages.ts`, `vite-wasm-sourcemaps.ts` → `vite-plugins/`.
- `index.html.hbs`, `puzzle.html.hbs`, `_headers.txt.hbs` → `templates/`.
- `unsupported.html` → `templates/` (it's a static template, not a Vite
  entry point; the existing `vite.config.ts` allowlists it explicitly).

`vite.config.ts` stays at the root (it's the entry config Vite expects
there); only the imports update.

### 3. Drop Wrangler

- Delete `wrangler.toml`.
- Remove `"wrangler": "^4.83.0"` from `devDependencies`.
- Remove `"preview:pages"` from `scripts`.
- **BREAKING (no current users)**: anyone who was using `npm run
  preview:pages` for a local CF Pages preview loses it. The standard `npm
  run preview` (vanilla Vite preview) covers the same need for the PWA.

### 4. Side fixes worth landing together

- `scripts/build-emcc.sh` carries three stale `puzzles/build-webapp.` paths
  in `[WARN]` messages (from before the Docker removal). Update to point at
  the new `${BUILD_DIR}`.

## Impact

- **Affected specs**:
  - `build-pipeline` (MODIFIED — output-location requirement updates to the
    new `/build/{wasm,icons,native}/` layout).
  - `repo-layout` (ADDED — new capability covering where build inputs,
    tooling, and generated artefacts live in the tree).
- **Affected code**:
  - `vite.config.ts` (plugin imports; handlebars template paths)
  - `scripts/build-emcc.sh`, `scripts/build-icons.sh` (BUILD_DIR paths,
    stale warn strings in build-emcc.sh)
  - `.gitignore` (drop `/puzzles/build/`; the existing `/build/` line
    already covers the consolidated layout)
  - `package.json` (drop wrangler dep + preview:pages script)
  - `README.md`, `PLAN.md`, `CLAUDE.md` (path references)
  - `wrangler.toml` (deleted)
  - `puzzles/auxiliary/` harness instructions in archived openspec changes
    are stale by virtue of archive; no need to rewrite history, but new
    proposals SHALL reference `/build/native/`.
- **Verification**:
  - `npm run build:wasm`, `npm run build:icons`, `npm run dev`, `npm run
    build`, `npm run preview` all succeed.
  - Characterization harness commands from `puzzles/auxiliary/`
    (`random-trace` workflow) still produce the same JSON corpus when
    pointed at `/build/native/` instead of `/puzzles/build/`. Replay
    test in `src/native/random/` stays green.
  - `npm install` works without wrangler in node_modules.
  - `git grep wrangler` returns no hits in tracked files.
