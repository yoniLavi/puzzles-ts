# puzzle-icons Specification Delta — retire-c-engine

## MODIFIED Requirements

### Requirement: Per-puzzle thumbnail icons are committed PNGs

The repository SHALL maintain two committed PNG files per cataloged
puzzle in `src/assets/icons/`: `<puzzleId>-64d8.png` (64×64) and
`<puzzleId>-128d8.png` (128×128). For every `puzzleId` in the catalog
(`src/puzzle/catalog-data.ts`), both files MUST be present and tracked in git —
`src/assets/icons/` is a *committed snapshot*, not a generated directory.

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
- **THEN** every `puzzleId` in the catalog is asserted to have
  `<puzzleId>-64d8.png` and `<puzzleId>-128d8.png` present in
  `src/assets/icons/`
- **AND** a test failure names the missing file path

#### Scenario: A new puzzle is added to the catalog

- **WHEN** a contributor adds a new puzzle to `src/puzzle/catalog-data.ts`
- **AND** does not provide the matching `<puzzleId>-{64d8,128d8}.png`
  files in `src/assets/icons/`
- **THEN** `npm run test:run` fails on the catalog-completeness test
- **AND** the contributor SHALL produce the icons via the manual
  screenshot workflow (next requirement) before merge

#### Scenario: Icons are not gitignored

- **WHEN** a contributor inspects `.gitignore`
- **THEN** `src/assets/icons/` is NOT ignored
- **AND** the only generated-asset directory under `src/assets/` is
  `src/assets/manual/` (output of `npm run build:assets`)

### Requirement: Adding a new puzzle's icons is a manual screenshot workflow

A contributor adding a new puzzle to the catalog SHALL produce the two
required PNGs by running the PWA, capturing a representative
screenshot of the puzzle canvas, and resizing it to the two required
sizes. No brew toolchain (GTK, ImageMagick, oxipng) SHALL be required
for this work.

The preferred procedure SHALL be:

1. Add the new puzzle — register it in `src/native/games/index.ts` and add its
   catalog entry to `src/puzzle/catalog-data.ts` — then run `npm run dev`.
   (This step used to require building the puzzle's C into wasm; there is no
   such build any more.)
2. Open the puzzle in the dev server with the capture param
   (`http://localhost:5173/<puzzleId>?screenshot`); accept the default
   preset; re-roll with **New game** until the board is representative.
3. Activate **Capture icons**; the two correctly-named, correctly-sized
   PNGs (`<puzzleId>-64d8.png`, `<puzzleId>-128d8.png`) download.

#### Scenario: A new puzzle's icons are produced without a build toolchain

- **WHEN** a contributor adds a puzzle and needs its icons
- **THEN** registering the game and adding its catalog entry is enough to open
  it in the dev server
- **AND** no wasm or C toolchain step is involved
