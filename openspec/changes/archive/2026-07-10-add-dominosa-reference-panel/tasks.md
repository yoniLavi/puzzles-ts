## 1. Generic reference-aid engine seam

- [x] 1.1 Add `ReferenceModel` / `ReferenceItem` types and optional `reference?(state, ui)` +
      `selectReference?(ui, key): boolean` hooks to the `Game` interface (`game.ts`).
- [x] 1.2 `Midend`: surface `hasReference = this.game.reference !== undefined` in
      `getStaticProperties()`; add `getReference(): ReferenceModel | null` (calls the hook
      with current state+ui) and `selectReference(key): void` (calls the hook, and on a
      `true` return runs the `UI_UPDATE` redraw path — no move, no history, not serialised).
- [x] 1.3 Extend `PuzzleEngineSurface` + `PuzzleStaticAttributes` with `hasReference`,
      `getReference`, `selectReference`; forward them in `TsWorkerPuzzle`; make `WorkerPuzzle`
      (C/WASM) return `hasReference:false`, `getReference:()=>null`, `selectReference:()=>{}`.
- [x] 1.4 `Puzzle`: copy `hasReference` to a `public readonly` field in the constructor; add
      `getReference()` / `selectReference(key)` wrappers over the worker surface.

## 2. App-shell control + responsive panel

- [x] 2.1 `puzzle-history.ts`: add a toolbar toggle button next to Hint, gated by
      `this.puzzle?.hasReference`, that toggles the panel open/closed (dispatches up to
      puzzle-screen, mirroring how dialogs are opened).
- [x] 2.2 New `src/components/reference-panel.ts`: a `SignalWatcher` Lit component consuming
      `Puzzle` via context; `@state() model`/`selectedKey`; re-fetch `getReference()` on move
      change / open; render items (domino pips from `pips`, else `label`) with per-status
      styling; click → toggle `selectedKey` + `puzzle.selectReference(...)`.
- [x] 2.3 `puzzle-screen.ts`: wire the open/close state; lay the panel out **non-blocking** —
      side-docked `aside` on wide viewports (board reflows, stays interactive), bottom sheet
      on narrow viewports (board visible + tappable above), no scrim; close button.

## 3. Dominosa implementation

- [x] 3.1 `state.ts`: add `highlightPair: number | null` to `DominosaUi` (default null).
- [x] 3.2 `index.ts`: implement `reference(state, ui)` (enumerate all `DCOUNT(n)` pairs;
      status outstanding/placed/conflict from a grid scan; `selected` from `ui.highlightPair`;
      `pips` per item) and `selectReference(ui, key)` (parse key→domino index or null; set
      `ui.highlightPair`; return changed). Reset `highlightPair` with `highlight1/2` on
      completion. Wire both hooks into `dominosaGame`.
- [x] 3.3 `render.ts`: add `COL_REFERENCE` (appended past the palette) + a `DF_REF` per-tile
      bit folded into the packed cache key; for `ui.highlightPair`, box both cells of every
      adjacent pair whose two clue values match that domino.

## 4. Tests

- [x] 4.1 Tier-1 (`dominosa.test.ts`): `reference()` marks a placed pair `placed`, an unplaced
      one `outstanding`, a doubly-placed value `conflict`; `selectReference` toggles the Ui
      field; enumerates exactly `DCOUNT(n)` items.
- [x] 4.2 Tier-2.5 (`dominosa.test.ts`): a selected pair renders `COL_REFERENCE` boxes on the
      candidate cells and nowhere else (targeted op assertion + snapshot).
- [x] 4.3 Engine (`midend.test.ts`): a game exposing `reference` reports `hasReference`;
      `getReference()` returns its model; `selectReference()` triggers a redraw without adding
      an undo entry or mutating the move log.
- [x] 4.4 Tier-3 (`puzzle-screen.test.ts`, happy-dom): the `toggle-reference` command flips the
      panel open/closed. (The panel's own DOM/click — which needs a mounted Web Awesome tree
      this file deliberately avoids under happy-dom — is covered by the Playwright dev-verify.)

## 5. Verify + docs

- [x] 5.1 Full gate: `tsc -b --noEmit` → biome → `vitest run` → `vite build`.
- [x] 5.2 Dev-verify in the browser (Playwright): open the panel on Dominosa; checklist ticks
      off live as dominoes are placed; a clicked pair boxes its candidates on the still-
      interactive board; desktop side-dock and narrow-viewport bottom-sheet both keep the
      board usable; 0 console errors.
- [x] 5.3 Update `docs/porting/game-port-playbook.md` with a short "reference-aid" note (the
      generic seam + when a game should offer one).

## 5b. Owner-review follow-ups

- [x] 5b.1 **Horizontal-orientation layout fix**: a side dock's `padding-inline-end` shoved the
      board off-centre in short-landscape ("horizontal") orientation (flex-row `main` with the
      toolbar as a right column). The panel now uses the bottom sheet there, keyed off the same
      `(orientation: landscape) and (max-height: 40rem)` condition as `--app-orientation`.
- [x] 5b.2 **Spotlight persistence + board-tap dismiss** (owner-refined twice): the board
      spotlight PERSISTS when the panel closes (the mark→close→place flow on small screens needs
      it). The primary clear is **any board tap** — Dominosa's `interpretMove` clears
      `highlightPair` on an in-grid pointer tap (still doing the tap's action; repaints even on a
      no-op tap), since Escape is undiscoverable/absent on touch. Escape (open→`clearSelection`,
      closed→`selectReference(null)`) and re-clicking the chip are secondary clears. Spec
      scenarios (ts-engine + dominosa) + tier-1 test added.
- [x] 5b.3 **(Handed off to `fix-canvas-sizing-race`) board-shrinks-on-reload**: diagnosed a
      pre-existing canvas-sizing race (first `resize()` measures a not-yet-settled layout before
      the async worker canvas attaches; the `flex:1` host box never changes again so the
      `ResizeObserver` never re-fires; a window resize is the only recompute). Affects every
      game; editing a Lit component full-reloads the page and re-triggers it. Deferred re-resize
      attempts were flaky against the async attach, so reverted — this needs its own focused
      change to the sizing lifecycle, not a hack bundled here.

## 6. Ship

- [x] 6.1 **Owner acceptance** in `npm run dev`, then commit + `openspec archive
      add-dominosa-reference-panel` (apply deltas to `ts-engine` + `dominosa`).
