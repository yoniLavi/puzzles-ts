# adopt-american-spelling

## Why

The repository spells the same word two ways, and the seam runs through the
middle of the app rather than along any boundary a reader could predict.

The engine and the games say `colour`: the `Colour` type, `Game.colours()`,
`src/engine/colour/`, `colour-token.ts`, `colour-mkhighlight.ts`,
`gridFindIncentre`, `neighbour`, `serialise`, `initialise`, `grey`. The app shell
says `color`: `src/utils/color.ts`, `color-scheme.ts`, `colorScheme` (the
persisted preference key), `--background-color`, `cssColorToOKLCH`. The two meet
in single files — `src/engine/testing/oklch.ts` defines `colourToOKLCH` and
documents itself as a copy of `utils/color.ts`; `src/games/spokes/render.ts`
keeps a `colors: Int32Array` field it compares against a `colour` argument. The
player sees both: the catalog's objectives say "colour" while `help/install.md`
says "favorite" and `help/features.md` says "behavior"; the thirteen
`puzzles-unreleased` help pages are American and the upstream-adopted ones are
British.

**Where each half came from is not in doubt, and neither half was chosen here.**

- Upstream is British by design. Simon Tatham's `puzzles.h` (readable at
  `git show pre-ts-pivot:puzzles/puzzles.h` and in `../puzzles/`) names the
  backend hook `colours()`, the midend accessor `midend_colours()`, the frontend
  hook `frontend_default_colour()`, and every drawing primitive's `int colour`
  parameter; `devel.but` documents it under `\S{backend-colours}`. Measured over
  `../puzzles/*.c,*.h`: `colour` 976 to `color` 42, and the 42 are local
  comments inside contributor-written games (`magnets.c`, `towers.c`,
  `undead.c`, `galaxies.c`, `mosaic.c`) and the platform frontends, never the
  API. The other pairs go the same way — `initialise` 67:5, `centre` 167:53,
  `grey` 64:0, `serialise` 19:0, `optimise` 32:0, `neighbour` 248:2.
- The direct parent is American by authorship. `../puzzles-web/src/` has `color`
  297 to `colour` 30, and every one of the 30 sits on the C boundary
  (`drawing.ts` taking a `colour: number` palette index and immediately passing
  it as `fillColor`). Its files are `utils/color.ts`, `color-scheme.ts`,
  `color-scheme-init.ts`; its prose says `initialize`, `serialize`, `behavior`,
  `favor`.
- This repo inherited both and never decided. No file under `AGENTS.md`,
  `docs/`, `openspec/specs/` or `biome.json` states a spelling convention; the
  engine took its vocabulary from the C it was ported from, the shell kept the
  parent's, and every spec and guide written since copied whichever identifier
  it was describing.

The owner's condition for keeping British spelling was that it be intentional
upstream. It was — and that is the whole of the argument for it, because the C
it was intentional *in* is no longer in the tree ("there is no C anywhere in
this repo"; the C is read only for logic). Meanwhile the platform this code runs
on is American and cannot be renamed: CSS `color`, `prefers-color-scheme`,
`text-align: center`, `HTMLDialogElement`, Web Awesome's `--wa-color-*` tokens.
Only one of the two spellings can be made consistent across the whole tree.
That decides it: **American, everywhere this project's own words are.**

## What Changes

One mechanical sweep, verified by shape, in two phases with different owners.

**Phase 1 — the code and its documents (this change decides it).**

1. **Identifiers**: every TypeScript identifier carrying a British stem is
   respelled — `Colour` → `Color`, `colours()` → `colors()`, `ncolours`,
   `bgcolour`, `colourToOKLCH`, `gridFindIncentre` → `gridFindIncenter`,
   `neighbours`, `serialise`, `initialise`, `normalise`, `grey`, and the rest of
   the table in `design.md` D3. Measured on 2026-09-02: 495 of 696 `.ts` files,
   5,138 lines (3,142 code, 1,951 comment), roughly 235 distinct identifiers of
   which 111 carry `colour`.
2. **Paths**: `src/engine/colour/` → `src/engine/color/` and its five
   `colour*`/`colours*` files; `scripts/checks/colour-{inventory,dark-check,collide}.test.ts`;
   `metrics/colour-inventory.md` (regenerated, not edited);
   `src/engine/grid/grid-incentre.test.ts`; and `licences/` → `licenses/` with
   `sgt-puzzles-LICENSE` and `puzzles-unreleased-LICENSE`. **The contents of the
   two notices do not change by a byte** — they are someone else's words — and
   the About dialog's two `?raw` imports are repointed in the same commit.
   Every move is a `git mv`.
3. **The render recorder's `colour` key** (`engine/testing/recording-drawing.ts`)
   becomes `color`, and the 65 snapshot files (19,550 keys) are re-baselined —
   with the re-baseline diff proved to be that one substitution and nothing
   else, so a render regression cannot hide inside it.
4. **Comments, `docs/`, `AGENTS.md`, `README.md`, `CREDITS.md`, `LICENSE.md`,
   `scripts/`, `templates/`**: prose spelling follows the identifiers. The
   quotation of an upstream C symbol (`game_colours`, `midend_colours`,
   `frontend_default_colour`) is a quotation and keeps its spelling.
5. **Specs**: the requirements whose normative text names a renamed identifier
   or path get deltas (`ts-engine` ×3, `pegs`, `grid`, `licensing`,
   `ts-migration`); `repo-layout` gains the convention as a requirement, with
   a guard that reports a British stem in a swept area and counts what it
   scanned. The remaining prose in `openspec/specs/` (64 of 70 files, 853
   lines) is swept mechanically and proved by shape, the same way
   `retire-native-directory` swept `src/native/` paths.
6. **Pending changes** naming a moved path are repointed (`repo-layout`
   requires it): `claim-project-authorship` names `licences/`.
7. **The probe corpus**: 11 of 193 cases anchor on a line with a British stem
   and are re-anchored; `npm run probe -- --verify` gates it.
8. **The flood C-reference fixture** keeps its recorded bytes; its own `"colours"`
   key (our recording schema, twelve occurrences) is renamed with its reader.

**Phase 2 — words a player reads (the owner decides; scoped and costed here).**
The 28 help pages with British spelling, the catalog objectives ("Colour the map
so that adjacent regions are never the same colour"), the preset labels
(`{colours} colours`), the config labels ("No. of colours") and the validation
messages ("Number of colours must be at least three") — 69 string literals in
`src/` plus 50 lines under `help/`. Three of those strings are config `kw`
values (`"colours"` in Flood and Guess, `"no-of-colours"` in Samegame) that
`game.ts` documents as keys the app persists, so they are a data-compatibility
question, not a spelling one. The recommendation is in `design.md` D5; the
tasks are listed but marked as waiting on that decision.

**Explicitly not in this change.**

- `openspec/changes/archive/` and `openspec/postmortems/` — the record of what
  was done, in the words it was done in. Rewriting 2,175 occurrences of
  `colour` in the archive would produce a history that never happened.
- The upstream MIT notices' contents, and the recorded bytes of any C-derived
  fixture.
- Any behaviour. No board changes, no render output moves, no test's assertion
  changes meaning. This is the same class of edit as `retire-native-directory`,
  and it is checked with the same tool (`scripts/check-rename-shape.mjs`).

## Impact

- **Affected specs**: `repo-layout` (1 added), `ts-engine` (3 modified, 1 of
  them renamed), `grid` (1 modified + renamed), `pegs` (1 modified),
  `licensing` (1 modified), `ts-migration` (1 modified), `build-pipeline`
  (1 modified — the gate gains the spelling guard in its fast prefix; design
  D6 records why it is a gate script and not a vitest file); plus a mechanical
  spelling sweep over the rest, shape-proved.
- **Affected code**: ~500 `.ts` files edited, 18 tracked files renamed, 65
  snapshots re-baselined, 1 fixture key renamed, 11 probe anchors moved. Every
  edit is a respelling; `tsc -b --noEmit` catches a missed identifier, `vite
  build` catches a missed `?raw` path, the probe check catches a missed anchor,
  and the new spelling guard catches a missed word.
- **Risk**: concurrency, not correctness. Another session is editing
  `src/engine/colour/`, `src/games/{loopy,palisade,separate}`,
  `src/puzzle/augmentation.ts` and `docs/games/rendering.md`; a sweep across
  those files while they are open produces conflicts in exactly the files that
  matter. The sweep lands after that work does, in one commit, from a clean tree.
- **Compatibility**: none in phase 1 — no persisted key, URL, game ID or save
  format carries a British spelling (`colorScheme` is already American, params
  persist as encoded strings such as `12x12c6m5`). Phase 2's three config
  `kw`s are the only candidates and are flagged for the owner.
