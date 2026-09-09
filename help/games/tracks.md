# Tracks

Complete the track from A to B so that the rows and
columns contain the same number of track segments as are indicated in the
clues to the top and right of the grid. There are only straight and
90-degree curved rail sections, and the track may not cross itself.

Left-click on an edge between two squares to add a track segment between
the two squares. Right-click on an edge to add a cross on the edge,
indicating no track is possible there.

Left-click in a square to add a color indicator showing that you know the
square must contain a track, even if you don't know which edges it crosses
yet. Right-click in a square to add a cross indicating it contains no
track segment.

Left- or right-drag between squares to lay a straight line of is-track or
is-not-track indicators, useful for filling in rows or columns to match the
clue.

## Hints

**Hint** explains the next step rather than simply making it, and because
Tracks decides two different kinds of thing — whole squares, and the
individual sides between them — the mark tells you which one it means.

* **A ring round a square** means that square is settled. If a blue cross is
  drawn in it as well, it must be empty; a ring on its own means it must carry
  track, though not yet which way the track runs.
* **A short pair of rail ends poking through a side** means the track must
  cross that side.
* **A cross on a side** means it must not.

What the hint is reasoning *from* is marked in the second color: an outline
round the squares it is counting, a short bar on a side whose state is part of
the argument, and — since half of most Tracks deductions is a clue rather than
anything on the grid — the clue number itself, recolored in the margin. When a
hint says "this column already has all 4 of the track squares its clue
allows", the 4 it means is the one that has changed color, and the squares it
is counting are the ones outlined.

Every hint is a deduction you could have made from what is on the board, so it
never guesses. It is refused while anything you have marked contradicts the
solution; the offending squares light up instead, exactly as they do for
**Check & save**.
