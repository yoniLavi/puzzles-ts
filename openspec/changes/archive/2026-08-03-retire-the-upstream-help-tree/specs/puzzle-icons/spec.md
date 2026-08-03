# puzzle-icons Specification Delta — retire-the-upstream-help-tree

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

**Nothing under `src/assets/` is generated.** The icons were the *committed*
exception to a directory that also held one generated tree — `src/assets/manual/`,
the halibut output — and that tree is gone with the manual it built
(`retire-the-upstream-help-tree`). The distinction the original scenario drew,
between the committed icons and the one generated neighbour, no longer has a
second term: `src/assets/` holds committed files only, and `.gitignore` carries
no rule for any directory under `src/`.

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
- **AND** no directory under `src/` is ignored as generated output
