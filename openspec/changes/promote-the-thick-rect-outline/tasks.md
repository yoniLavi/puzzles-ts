# promote-the-thick-rect-outline — tasks

`re-express-the-collection` B4. Implemented 2026-09-06.

## 1. Promote

- [x] 1.1 `drawThickRectOutline` in `engine/draw.ts`, beside `drawRectCorners`
      whose doc records the same promotion at seven copies.
- [x] 1.2 Convert the eight: bricks, clusters, crossing, magnets, pattern,
      sticks, tents, unruly. Pattern's private `rectOutline` deleted.
- [x] 1.3 Each game keeps the two things it chooses — its thickness formula and
      whether the frame is inset. Only the four `drawRect` calls moved.

## 2. Decline the rest of the batch, with reasons

- [x] 2.1 clusters ~ sticks **cursor** frame — same primitive, third emission
      order, and *whether the cursor mark and the error mark are one thing* is a
      design question rather than a duplication. Left.
- [x] 2.2 clusters ~ sticks paint-while-traversing arm — `pointer.ts` already
      rules that a game's verb while the cursor moves stays with the game.
- [x] 2.3 inertia~sokoban, undead~unequal, map~tents, group~towers,
      bricks~unruly, keen~towers — the shape `border-grid.ts` names explicitly:
      a `w*h` loop that reads a flag and draws a line resembles its counterpart
      in every grid game, and unifying it couples two renderers with no reason
      to move together.

## 3. Give the shared primitive a test at its own level

- [x] 3.1 **Measured the exposure first**: with the helper wired into all eight,
      deleting a side of the frame failed **one** test in the collection
      (Crossing's). Tents' and Magnets' snapshots contain zero mistake ops.
- [x] 3.2 `draw.test.ts` asserts the painted ring by **pixel coverage** — every
      border pixel painted, no interior pixel painted — rather than by op order,
      so it tests the frame rather than the emission.
- [x] 3.3 **Proved it fails**: dropping a side turns it red. (A one-pixel
      shortening of one band does *not* fail it, correctly: the adjacent band
      already covers that corner, so the painted result is unchanged. The test
      asserts the result, which is the thing that matters.)

## 4. Verify

- [x] 4.1 `tsc -b --noEmit` clean; the eight games plus `draw.test.ts` pass —
      447 tests, no snapshot moved.
- [x] 4.2 Every call site checked algebraically against the inline code it
      replaced: same rect, same thickness, per game.

## Findings

- **Seven of eight error frames are drawn by code no test observes.** That is
  what the promotion measured, and it is a coverage gap rather than a
  convergence one — filed in `survey.md` as a follow-up, because closing it
  means adding mistake-overlay render scenarios, which is its own work.
- **The declines outnumber the takes six to one**, as `survey.md` predicted for
  this batch. The one that was taken is a *primitive*; the six declined are
  *loops that resemble each other*, which is exactly the line `border-grid.ts`
  draws.
