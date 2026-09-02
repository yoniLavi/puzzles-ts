# Loopy

Form a single closed loop out of the grid edges, in such a way that
every numbered square has exactly that many of its edges included in
the loop.

Click on a grid edge to mark it as part of the loop (black), and
again to return to marking it as undecided (yellow). Right-click on
a grid edge to mark it as definitely not part of the loop (faint
grey), and again to mark it as undecided again.

On a touch screen, tapping an edge cycles it through all three states,
so you never need a second button.

You can also play entirely from the keyboard. Everywhere else in this
collection the cursor sits on a square; here you are marking the *edges*
between squares, so the cursor sits on a **corner** instead, and an arrow
key picks the edge leaving that corner in that direction. Press the same
arrow again to step round to the next edge at that corner — you will
only need this on grids where more edges meet than there are arrow keys,
such as the triangular one. Then:

- **Enter** marks the chosen edge as part of the loop, exactly as a left
  click does, and carries the cursor along it to the far corner, so you
  can trace a loop with one Enter per edge. Enter again on a marked edge
  clears it.
- **Space** marks the chosen edge as definitely not part of the loop,
  exactly as a right click does, and again to clear it.
- **Backspace** or **Delete** clears the chosen edge.
- **Shift + arrow** walks the cursor one corner in that direction
  without marking anything, so you can get to another part of the board.
- **Escape** hides the cursor; any click hides it too.

The cursor is drawn as a green disc on its corner, with a green halo
under the edge it has chosen.

When you have mastered the square grid, look in the Type menu for
many other types of tiling!
