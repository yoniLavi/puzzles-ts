## Context

Icons are a committed snapshot (`src/assets/icons/`, `puzzle-icons`
spec). Every new puzzle needs two square PNGs at 64 and 128 px. Today
that is DevTools-capture + hand-resize. We already have a clean
canvas→Blob path: `Drawing.getImage()` → `canvas.convertToBlob()`,
surfaced as `Puzzle.getImage(options)` and used by the existing
`Copy image` command (`puzzle-screen.ts` `copy-image`). The gap is
purely "square-crop + downscale to the two canonical sizes + download
with the canonical names."

## Goals / Non-Goals

- Goals: one-click production of both correctly-named, correctly-sized
  PNGs from a live board; a clean chrome-free canvas to capture; ability
  to re-roll the board first; zero production footprint.
- Non-Goals: batch-capturing all puzzles headlessly (a later script can
  drive `?screenshot` if wanted); editing/recolouring icons; replacing
  the committed-snapshot model; capturing anything but the default-preset
  initial board.

## Decisions

- **URL param, not just a menu command.** AGENTS.md names a
  `--screenshot` *param*; a param is scriptable (a future Playwright loop
  can open `/<id>?screenshot`) and gives a deliberately stripped-down
  view. We still wire the capture through the existing `commandMap` so
  the logic has one home.
- **Capture is user-gesture triggered, not auto-on-load.** Programmatic
  downloads without a user gesture (and multiple files at once) are
  throttled/blocked by browsers. A "Capture icons" button = one clean
  gesture. It also lets the developer re-roll to a representative board
  before capturing (many generators produce visually sparse boards on
  some seeds).
- **Centre-crop to a square, then downscale.** Most boards are square,
  but some aren't; a centred largest-square crop keeps icons consistent
  with the existing 53 and avoids the "off-center crop" review smell the
  spec warns about. Downscale via `drawImage` into 64²/128² canvases
  (`imageSmoothingQuality: "high"`).
- **Dev-only.** Guard the capture mode behind `import.meta.env.DEV` so
  the production bundle neither ships the mode nor changes behaviour for a
  stray `?screenshot`. The helper module is only imported on that path,
  so it tree-shakes out of prod.
- **Both files from one click.** Trigger two `<a download>` saves for the
  64 and 128 PNGs. Chrome shows its standard "download multiple files"
  permission once; acceptable for a dev affordance. Filenames are the
  canonical `<puzzleId>-{64,128}d8.png`.

## Risks / Trade-offs

- Multi-download permission prompt (Chrome) / sequential saves (Safari):
  acceptable for a dev tool; documented in the spec workflow.
- A non-representative random board → poor icon. Mitigated by the
  in-mode **New game** re-roll and the existing PR visual-review gate.

## Open Questions

- A headless batch script over `?screenshot` is attractive but out of
  scope here; the param is the enabling primitive.
