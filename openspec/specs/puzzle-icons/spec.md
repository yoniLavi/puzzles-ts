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

The preferred procedure SHALL be:

1. Add the new puzzle to the WASM build (its source under `puzzles/`
   and its catalog entry); run `npm run build:wasm` and `npm run dev`.
2. Open the puzzle in the dev server with the capture param
   (`http://localhost:5173/<puzzleId>?screenshot`); accept the default
   preset; re-roll with **New game** until the board is representative.
3. Activate **Capture icons**; the two correctly-named, correctly-sized
   PNGs (`<puzzleId>-64d8.png`, `<puzzleId>-128d8.png`) download
   directly.
4. Move the two files into `src/assets/icons/`.
5. Run `npm run test:run` to confirm the asset-integrity test passes.
6. Commit the new PNGs alongside the new puzzle's other changes.

A manual fallback (no capture param available) remains valid: take a
DevTools "Capture node screenshot" of the canvas and resize it to 64×64
and 128×128 in any image tool. PNG24 is acceptable; the existing icons
are PNG-with-palette but new icons need not match.

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

### Requirement: Dev-only screenshot capture mode

The puzzle page SHALL accept a `screenshot` URL query param that, in a
development build (`import.meta.env.DEV`), puts the screen into a
**capture mode**: the normal header/footer chrome is hidden and only the
puzzle canvas plus a minimal capture bar are shown. In a production
build the param SHALL have no effect — the page renders exactly as it
does without the param.

The capture bar SHALL offer a **New game** action (to re-roll the board
to a representative state) and a **Capture icons** action. **Capture
icons** SHALL capture the live canvas, centre-crop it to its largest
centred square, downscale that square to 64×64 and to 128×128, and
download both results as PNGs named `<puzzleId>-64d8.png` and
`<puzzleId>-128d8.png` — the exact filenames `src/assets/icons/`
requires.

#### Scenario: Capture mode in a dev build

- **WHEN** a developer opens `/<puzzleId>?screenshot` on `npm run dev`
- **AND** the default-preset board has rendered
- **AND** the developer activates **Capture icons**
- **THEN** two PNG files download: `<puzzleId>-64d8.png` (64×64) and
  `<puzzleId>-128d8.png` (128×128)
- **AND** each is a centred-square downscale of the puzzle canvas

#### Scenario: Param is inert in production

- **WHEN** the production build serves `/<puzzleId>?screenshot`
- **THEN** the normal puzzle screen renders (header, footer, interactive
  view) with no capture bar and no capture behaviour

