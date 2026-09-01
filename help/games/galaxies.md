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

## Hints

**Hint** explains the next step rather than simply making it. Most of
what it says is about the arrows: the square whose dot the deduction
settles is filled in the hint's colour, and the dot itself is ringed in
the same colour. The square opposite the dot — which gets its arrow at
the same time, as always — is only outlined, since it comes along rather
than being what the hint is telling you about. Squares the argument
reasons *from* — how far a galaxy can still stretch, the piece that has
been cut off from its dot, the partner across a dot — are shaded in a
second colour, so you can see the reason as well as read it.

One of the things it looks for is the same thing the drag rings show
you: when only one dot could possibly own a square — every other dot
would need the square opposite it to be off the board or on top of
another dot — that square is settled, and dragging from it will ring
exactly one dot.

Once two neighbouring squares are settled on different dots, the hint
asks for the line between them, and it is those lines, not the arrows,
that finish the puzzle.

Every hint is a deduction you could have made from what is on the board.
On an **Unreasonable** board there may come a point where no deduction is
left and the only way on is to try something and see whether it works —
that is what [the difficulty name means](../features#difficulty). The hint
says so rather than guessing for you: save your position, try it, and undo
if it breaks. (Or use **Solve**, if you would rather see the answer.)

A hint is refused while anything on the board contradicts the solution.
The offending squares and lines light up instead, exactly as they do
for **Check & save**.
