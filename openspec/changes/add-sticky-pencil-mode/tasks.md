# Tasks: Sticky pencil mode + indicator (Towers)

## 1. Sticky pencil mode
- [x] 1.1 `state.ts`: add `Ui.pencilSticky` (default true in `newUi`).
- [x] 1.2 `index.ts` `interpretMove`: sticky path — right-click toggles the
      persistent pencil mode + moves the highlight; left-click keeps the current
      mode (only moves the highlight). Non-sticky path = upstream behaviour.
- [x] 1.3 `index.ts` `prefs`: add the `sticky-pencil-mode` boolean pref.

## 2. Indicator
- [x] 2.1 `render.ts`: `DF_PENCIL_MODE` flag; set it on the top-right corner tile
      when `ui.hpencil`; draw a small pencil glyph for it in `drawTile`.

## 3. Tests + verification
- [x] 3.1 `towers.test.ts`: sticky-on keeps pencil mode across left-clicks +
      right-click toggles it off; sticky-off reverts on left-click.
- [x] 3.2 `towers.test.ts`: the indicator draws a `COL_PENCIL` line only while
      pencil mode is on.
- [x] 3.3 Full gate green (tsc → biome → vitest → vite build).
- [x] 3.4 Dev-verify: indicator visible in pencil mode; left-click keeps mode;
      right-click toggles; 0 console errors.

## 4. Spec + close-out
- [x] 4.1 `openspec validate add-sticky-pencil-mode --strict`.
- [ ] 4.2 Owner acceptance, then archive in the same commit.
