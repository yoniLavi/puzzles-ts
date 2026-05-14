# puzzle-icons Specification

## Purpose
TBD - created by archiving change drop-icon-generation. Update Purpose after archive.
## Requirements
### Requirement: Per-puzzle thumbnail icons are committed PNGs

The repository SHALL maintain two committed PNG files per cataloged
puzzle in `src/assets/icons/`: `<puzzleId>-64d8.png` (64×64) and
`<puzzleId>-128d8.png` (128×128). For every `puzzleId` in
`src/assets/puzzles/catalog.json`'s `puzzleIds` array, both files MUST
be present and tracked in git — `src/assets/icons/` is a *committed
snapshot*, not a generated directory.

The two files SHALL be the only icon-asset shapes the home-screen
catalog reads. Specifically, `src/components/catalog-card.ts` consumes
`<puzzleId>-64d8.png` (1×) and `<puzzleId>-128d8.png` (2×) via
`new URL(..., import.meta.url)` and renders the result via
`<img srcset>`.

The `-d8` suffix is a legacy from the prior ImageMagick-quantized
8-bit-indexed pipeline. It is preserved in the filename for path
stability; new icons MAY be PNG24 without changing the suffix.

#### Scenario: Catalog completeness is asserted in tests

- **WHEN** `npm run test:run` runs `src/asset-integrity.test.ts`
- **THEN** every `puzzleId` in `catalog.json` is asserted to have
  `<puzzleId>-64d8.png` and `<puzzleId>-128d8.png` present in
  `src/assets/icons/`
- **AND** a test failure names the missing file path

#### Scenario: A new puzzle is added to the catalog

- **WHEN** a contributor adds a new puzzle to `catalog.json` (e.g. by
  promoting one from `puzzles/unreleased/`)
- **AND** does not provide the matching `<puzzleId>-{64d8,128d8}.png`
  files in `src/assets/icons/`
- **THEN** `npm run test:run` fails on the catalog-completeness test
- **AND** the contributor SHALL produce the icons via the manual
  screenshot workflow (next requirement) before merge

#### Scenario: Icons are not gitignored

- **WHEN** a contributor inspects `.gitignore`
- **THEN** `src/assets/icons/` is NOT ignored
- **AND** the only generated-asset directory under `src/assets/`
  remains `src/assets/puzzles/` (output of `npm run build:wasm`)

### Requirement: Adding a new puzzle's icons is a manual screenshot workflow

A contributor adding a new puzzle to the catalog SHALL produce the two
required PNGs by running the PWA, capturing a representative
screenshot of the puzzle canvas, and resizing it to the two required
sizes. No brew toolchain (GTK, ImageMagick, oxipng) SHALL be required
for this work.

The procedure SHALL be:

1. Add the new puzzle to the WASM build (its source under `puzzles/`
   and its catalog entry); run `npm run build:wasm` and `npm run dev`.
2. Open the puzzle in the dev server
   (`http://localhost:5173/<puzzleId>`); accept the default preset; let
   the puzzle render in its initial generated state.
3. Capture the puzzle canvas at native resolution (browser DevTools
   "Capture node screenshot" or any equivalent OS-native tool).
4. Resize the captured image to two square sizes — 64×64 and 128×128 —
   using any image tool. PNG24 is acceptable; the existing icons are
   PNG-with-palette but new icons need not match.
5. Save the two files as
   `src/assets/icons/<puzzleId>-{64d8,128d8}.png`.
6. Run `npm run test:run` to confirm the asset-integrity test passes.
7. Commit the new PNGs alongside the new puzzle's other changes.

#### Scenario: Contributor produces icons without brew GTK installed

- **WHEN** a contributor follows the procedure above on a machine that
  does NOT have `gtk+3`, `pkgconf`, `imagemagick`, or `oxipng` installed
- **THEN** the procedure completes successfully end-to-end
- **AND** the resulting PNGs satisfy `src/asset-integrity.test.ts`

#### Scenario: PR review covers visual quality

- **WHEN** a PR adds new icon files
- **THEN** the reviewer SHALL inspect the rendered home-screen card
  visually (via `npm run dev` or the staging deploy) before approving,
  to ensure the icon is visually consistent with the existing 53 icons
- **AND** any visual-style drift (DPI mismatch, background mismatch,
  off-center crop) SHALL be addressed before merge

