# Tasks: Add Drag-to-Slide support for Sixteen

- [x] Define updated `SixteenUi` schema to track active drag parameters (dragging status, start coordinates, current coordinates, and calculated axis).
- [x] Implement `LEFT_BUTTON` press state capturing in `interpretMove` to mark the drag start position inside the grid.
- [x] Implement `LEFT_DRAG` move tracking in `interpretMove` to update drag coordinates and offset.
- [x] Implement `LEFT_RELEASE` in `interpretMove` to calculate final cell displacement, snap to nearest alignment, and return a completed slide move.
- [x] Modify `redraw` in `src/native/games/sixteen/index.ts` to render the dragged row or column offset by the drag pixels, wrap-drawing tiles that cross the border.
- [x] Add unit/behavioral tests in `sixteen.test.ts` verifying that dragging a cell and releasing correctly executes the corresponding slide.
- [x] Run `npm run check` and `npm run build` to confirm all formatting, linting, and compiler checks pass.
