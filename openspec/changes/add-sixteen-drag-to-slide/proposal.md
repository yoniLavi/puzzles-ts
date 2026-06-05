# Change Proposal: Add Drag-to-Slide support for Sixteen

## Summary
Add direct mouse and touch drag-to-slide support for Sixteen rows and columns, making the sliding interactions feel fluid, responsive, and tactile.

## Motivation & Opportunity
Currently, Sixteen only supports clicking the outer border arrows to move rows or columns. Direct dragging of rows and columns is a much more modern and natural gesture, especially on touch devices. Other games like Galaxies and Pegs already support drag mechanics, so adding direct drag-to-slide to Sixteen will bring it up to premium PWA UX standards.

## Proposed Changes
1. **State & UI tracking**: Update `SixteenUi` to track the active drag state (starting tile, axis of drag, drag displacement in pixels).
2. **Input Handling**: Update `interpretMove()` in `src/native/games/sixteen/index.ts` to handle:
   - `LEFT_BUTTON` (pointer down): Record initial click coordinates and selected tile.
   - `LEFT_DRAG` (pointer move): Calculate pixel displacement, determine if the gesture is horizontal (row) or vertical (column), and update drag displacement.
   - `LEFT_RELEASE` (pointer up): Calculate total displacement, snap to the nearest cell boundary, and execute the final move with the corresponding delta.
3. **Rendering/Animation**: Update `redraw()` to offset the rendering of the active row or column by the drag displacement, rendering wrapped tiles beautifully on the opposite edge of the grid.
