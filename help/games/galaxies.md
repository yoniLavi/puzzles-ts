# Galaxies

Draw lines along grid edges so as to divide the grid up into connected
regions of squares.

Every region should have two-way rotational symmetry, should contain
exactly one dot which is in its centre, and should contain no lines
separating two of its own squares from each other. A region satisfying
all of these requirements will be automatically highlighted.

Click on a grid edge to add or remove a line.

Drag from a dot into a grid square to place an arrow there pointing
back at the dot, to indicate that you think that square must belong
in the same region as that dot. The square opposite the dot gets the
matching arrow at the same time, because a region is symmetric about
its dot. Drag an existing arrow to move it, or drop it off the edge
of the grid to remove it.

You can also drag the other way round: start on an empty square and
drag towards a dot, and the arrow is placed when you let go. While
you do, every dot that square could legally belong to is ringed, and
the one you are aiming at is ringed more heavily. If you would rather
work that out for yourself, turn off **While dragging from a cell,
ring the dots it could belong to** in Preferences — the gesture keeps
working, without the rings.

Either mouse button will do, and on a touchscreen an ordinary finger
drag works. The keyboard can do all of it too: move the cursor with
the arrow keys, and press Enter or Space to place a line, to pick up
an arrow, or to start and finish a drag.
