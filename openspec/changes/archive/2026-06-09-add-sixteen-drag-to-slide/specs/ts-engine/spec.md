# Delta Specification: Sixteen Drag-to-Slide Interaction

## ADDED Requirements

### Requirement: The Sixteen port supports direct row and column dragging

The Sixteen TS port SHALL support direct touch and mouse row/column dragging. When a user drags on a tile in the grid, the game SHALL track the horizontal or vertical drag vector and visually offset the dragged row/column in real-time. When released, the slide SHALL snap to the nearest cell alignment and execute the move if the drag distance exceeds half of a tile width.

#### Scenario: Dragging a row to slide it right
- **WHEN** a user pointerdowns on tile (0, 1), pointermoves right by 1.2 tiles, and pointerups
- **THEN** the game executes a slide move on row 1 with a delta of +1 (shifting right by 1)
