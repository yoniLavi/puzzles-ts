## Context

The previous `prune-unsupported-frontends` change deferred three files
(`gtk.c`, `printing.c`, `ps.c`) and one CMake platform file (`unix.cmake`)
because they were the rendering engine behind `scripts/build-icons.sh`.
That script is now obsolete: per AGENTS.md "Upstream policy" the C source
is frozen, so the screenshot output is also frozen, and an ungated commit
just landed that snapshots `src/assets/icons/` into git and demotes the
build script to "regenerate on demand."

This change finishes the deferred cleanup. The deliberate question is how
to preserve fidelity for "the next puzzle added to the catalog" without
the script.

## Goals / Non-Goals

Goals:

- Remove ~5,000 lines of upstream frontend / build-system code with no
  effect on the production wasm build.
- Eliminate four brew dependencies (`gtk+3`, `pkgconf`, `imagemagick`,
  `oxipng`) from the contributor's required tooling.
- Define a stable, low-friction workflow for "add a new puzzle's icon"
  that does not require any toolchain beyond what a normal PWA
  contributor already has.

Non-Goals:

- Removing `ps.c` from `core_obj`. Same argument as
  `prune-unsupported-frontends`: low-value edit to the upstream core
  source list, no measurable wasm size impact, defer to a natural future
  deletion checkpoint.
- Changing the visual style or sizing of existing icons. The committed
  PNGs stay byte-identical.
- Re-introducing a TS-side icon renderer (e.g., have the PWA itself
  produce the thumbnails). Out of scope; revisit if/when the manual
  workflow proves too friction-heavy in practice.

## Decisions

### Decision: Delete gtk.c rather than migrate to a TS renderer

Two alternatives considered:

1. **Migrate icon rendering to the TS-side PWA.** Add a hidden dev URL
   (e.g. `/dev/screenshot/<puzzleId>`) that renders the puzzle's canvas
   at exactly 64×64 / 128×128 and lets the contributor save the
   resulting image. Higher up-front effort; bakes a permanent
   maintenance burden into the PWA for a workflow that runs roughly
   once per year (when adding a puzzle).

2. **Manual screenshot workflow** (chosen). Contributor opens the
   puzzle in the running dev server, screenshots the canvas, resizes,
   saves. Zero net new code. The PWA's existing rendering is the
   source of truth. Frequency of use justifies the simpler approach.

If experience proves the manual workflow is too inconsistent (e.g.,
contributors produce visually mismatched icons), revisit alternative 1
as a follow-up change. The asset-integrity test will catch *missing*
icons; visual consistency is left to PR review.

### Decision: Keep ps.c in core_obj

`puzzles/ps.c` is in `puzzles/CMakeLists.txt`'s `core_obj` source list,
so it's compiled into the wasm. No wasm code calls into it (PostScript
output is a print-from-GTK feature this fork doesn't ship); the wasm
linker drops unused symbols, so the binary impact is zero. Removing it
would require editing the upstream `add_library(core_obj OBJECT ...)`
line — a change to upstream's CMakeLists.txt that adds conflict surface
for no measurable benefit. Defer until the broader rewrite reaches a
natural deletion checkpoint (per AGENTS.md "C is never deleted until
the rewrite is complete").

### Decision: WEB_APP option vanishes

After this change, `puzzles/cmake/platforms/` contains exactly one file
(`webapp.cmake`). The conditional in `setup.cmake` becomes the
unconditional `include(cmake/platforms/webapp.cmake)`. The `WEB_APP`
option no longer toggles anything; remove it. Anyone who relied on
`-DWEB_APP=OFF` was getting the icon-screenshot path, which no longer
exists.

### Decision: Drop `*-base.png` files entirely (not just from the test)

The 53 `*-base.png` files in `src/assets/icons/` are the unmodified
base screenshots before quantization. The PWA reads only `-64d8.png`
and `-128d8.png` (`catalog-card.ts:54,58`). The base files are pure
dead bytes (~108 KB across 53 files). Delete them; drop "base" from the
`asset-integrity.test.ts` suffix list. If a future need arises (e.g., a
larger icon size for a desktop install screen), regenerate from the
manual-screenshot workflow at the new size.

## Risks / Trade-offs

- **Risk**: A future contributor produces visually inconsistent icons
  (different background, wrong DPI, captured mid-game).
  **Mitigation**: The `puzzle-icons` capability spec documents the
  capture procedure (default preset, fresh game state, accept the
  initial generated state). PR review covers visual sanity. The
  asset-integrity test guards *presence*; visual quality is a softer
  gate.
- **Risk**: Removing `puzzles/gtk.c` and `puzzles/printing.c` makes a
  hypothetical future "actually we want to ship a desktop GTK build of
  this fork" more painful — those files would need to be re-fetched
  from upstream.
  **Mitigation**: Per AGENTS.md "Lineage", this fork's product is a
  PWA, eventually a packaged mobile shell. A desktop GTK build is
  explicitly out of scope. If reversed, upstream Simon Tatham is the
  canonical source.
- **Trade-off**: PNG24 from a manual screenshot is roughly 2-3× the
  byte size of the current ImageMagick-quantized output (~4–6 KB vs
  ~2 KB). At 53 puzzles × 2 sizes, worst case ~150 KB added to the
  repo *if* every puzzle were re-screenshot at PNG24. Today none are;
  the existing PNGs stay as-is. This is a per-future-puzzle cost, not
  a one-time hit.

## Migration Plan

1. Delete the script + cmake + GTK source files.
2. Update Brewfile, package.json, docs.
3. Strip "base" from the asset-integrity test and remove the
   `*-base.png` files.
4. Verify `npm run build:wasm` still works (both flag-OFF and
   `USE_TS_RANDOM=1`).
5. Verify `npm run dev` boots and home-screen icons render.
6. Verify `npm run test:run` passes.
7. Commit, archive the proposal.

Rollback: revert the commit. The deleted files are recoverable from git
history; `brew bundle install` picks the deps back up if needed.

## Open Questions

None outstanding. The deferred file list (`gtk.c`, `printing.c`,
`unix.cmake`) was already enumerated by `prune-unsupported-frontends`
as the things to remove "when the dependency is gone." The dependency
is gone.
