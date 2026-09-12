# Bridges

Draw horizontal or vertical bridges to link up all the islands.
Bridges may be single or double; they may not cross; the islands
must all end up connected to each other; the number in each island
must match the number of bridges that end at that island (counting
double bridges as two). Note that loops of bridges are permitted.

Click on an island and drag left, right, up or down to draw a bridge
to the next island in that direction. Do the same again to create a
double bridge, and again to remove the bridge if you change your
mind. Click on an island without dragging to mark the island as
completed once you think you have placed all its bridges.

## Hints

**Hint** explains the next step rather than simply making it, and because
Bridges decides two different kinds of thing — the bridges along a line, and
the islands at their ends — the mark tells you which one it means.

* **Bridges drawn in the hint color** are the ones to add. A line that already
  carries a bridge keeps it in the board's own ink, so you can see at a glance
  how many the hint is asking you to add.
* **A pair of small crosses along a line** means no bridge may ever run there.
  You can draw the same crosses yourself by dragging with the right mouse
  button.
* **An island recolored to match** is the island the sentence is talking
  about: when a hint says "this 5 still needs 2 more bridges", the 5 it means
  is the one that has changed color.

What the hint is reasoning *from* is marked in the second color: the islands it
is counting, and the bridges between them. When a hint says "a bridge here
would shut these 2 islands into a finished group of their own", the two islands
it means are the two that are outlined.

Every hint is a deduction you could have made from what is on the board, so it
never guesses. It is refused while a bridge you have drawn contradicts the
solution; the offending bridges light up instead, exactly as they do for
**Check & save**. Marking an island completed before it really is can also stop
the hint, because that locks bridges the island still needs — undo the mark and
ask again.
