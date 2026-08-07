# Design — refine-slide-appearance

## D0. A prerequisite fix, landed separately: a pure white had no dark-mode value

Establishing a contrast ladder "in both schemes" was impossible on the code as it
stood, and finding out why took the first hour of this change.

`colourToOKLCH([1, 1, 1])` returns lightness `1.0000000000000002` — float drift in
the OKLab round trip. `invertLightness` computes `1 - l`, a hair *below* zero, and
`compressLightness` raises that negative base to a fractional power: `NaN`, which
serialises to `oklch(NaN% 0 0)`. **A canvas ignores an invalid `fillStyle`
silently** — the previous value stays, so the shape is still painted, in the wrong
colour, with nothing logged. 57 palette entries across **42 of the 57 games** were
resolving that way, every game whose palette holds a pure white, which after
`game_mkhighlight` is most games with a bevel.

Slide was the visible one: a scanline across the live canvas found three greys in
light mode (fill, highlight, lowlight) and **two** in dark, because the lowlight
was being painted in the fill's own colour. Every block on the board had lost half
its bevel.

Fixed at `4166828` as its own commit — it is a bug fix restoring documented intent
(`compressLightness`'s own doc comment states the domain it then failed to
enforce), which openspec's workflow says needs no proposal, and its blast radius is
the collection rather than this change.

**The reusable half is what the existing test did.** `color.test.ts` already
asserted this exact property —

    expect(darkL([1, 0, 0])).toBeCloseTo(BGL, 5);

— and passed, because a hand-written `1` is not the number production supplies.
The whole defect lives in the epsilon the literal skips over. Same family as
`grid.test.ts`'s `d.edges.length === d.order`: **an assertion is only as good as
the path its inputs came down.** The replacement drives `colourToOKLCH`.

## D1. The ladder: four materials, ordered by what each one is

Upstream derives the floor, the walls **and** the ordinary blocks from one
`game_mkhighlight` trio, so all three are literally the same fill and are told
apart only by their bevels. Measured before this change, the whole board — floor,
wall, block, key block and exit — sat inside a **0.10 OKLCH lightness band**, and
three of those five were the identical value. The author's note asks to "darken
the tiles, the walls and the main block, and leave the target marker pale", and
the pair matters: raising everything else is what lets the exit's green stop
carrying the board, which is why the exit is **unchanged** here and becomes more
prominent by everything around it stepping back.

| material | light L | dark L | why there |
| --- | --- | --- | --- |
| exit | 0.951 | 0.272 | names the goal; the most prominent thing |
| floor | 0.871 | 0.355 | the board itself — a surface earns no contrast |
| ordinary block | 0.731 | 0.480 | an object resting on that floor |
| key block | 0.578 (C 0.16) | 0.601 (C 0.16) | the object that matters; hue *and* weight |
| wall | 0.584 | 0.597 | the one thing that never moves |

All five are functions of the host background, which is what makes the dark column
come out right with no authored value: one inversion rule maps all of them, so the
*ordering* is preserved by construction. Only the two the help page names to the
player — *"move the blue key block to the green exit area"* — carry a hue.

**The direction was decided by rendering it, not by arguing.** Two alternatives
were built and compared side by side in both schemes:

- **B — wall light (0.86), blocks dark (0.68).** Rejected: the wall frame lands
  0.09 from the floor and the two merge again, which is the exact defect this
  change exists to remove. It buys more pop for the blocks with the thing the
  change is for.
- **C — a milder wall (0.68) and a lighter block (0.84).** Rejected on spacing:
  its steps are 0.106/0.110 where A's are 0.140/0.147, for no gain.

The one real cost of A is that the wall, being the most contrasting fill in light
mode, is the *lightest* large area in dark mode (L 0.597, a mid grey). That is the
inversion working rather than failing — ΔL from the floor is 0.287 light and 0.242
dark — and 0.597 sits between the palette's dark wash band (0.34–0.48) and its
dark bold step (0.84), so it reads as a tray and not as a glare. Flagged here
because it is the judgement most worth overruling if the owner disagrees; moving
it is one constant.

## D2. The exit gate: mark the boundary, do not fill the square

Upstream's marking is a lattice — six thick lowlight bars per square in both
directions, over the whole cell — which its author called *"disgusting"* and asked
to have replaced with "something completely different". It is not in fact a cattle
grid; a cattle grid is parallel bars.

The replacement is a **dashed outline around the gate region**, in the wall's own
colour. Three things decide it:

1. **The gate usually lies inside the exit area**, so the two markings overlap and
   one of them cannot be a fill. A boundary can sit on top of a tint; a second
   tint cannot.
2. **It has to survive small tiles.** An outline is one band whatever the tile
   size; a texture turns to mud.
3. **Dashes are the message.** A solid line reads as a wall and this boundary is
   the one on the board that is *crossed*. The wall's colour says what it is —
   a gap in the wall.

Mechanically this needs each square to know about its neighbours, which is the
four bits left over above the shadow's flags (27..30; bit 31 is the sign of the
`Int32Array` the diff key lives in). Putting them in the packed word rather than
recomputing at draw time is not an optimisation — an overlay outside that word
silently fails to repaint (playbook §3.2).

## D3. The Solve route: one accent, two weights

A route is a two-part statement — *move this, to there* — which is the shape the
shared hint vocabulary exists for, and **Slide cannot use it**: `HINT_ACTION` is
blue and `HINT_BLACKREF` is green, and this board has already spent both on things
the help page names to the player. So the route takes the collection's remaining
strong accent and spends it once, at two weights.

- **The next piece keeps its own fill** and wears the accent as a band where its
  bevel would be. Upstream painted the whole piece in its own *highlight* — pure
  white on a light host — which is the "excessive" its author recorded: a light
  source where an ordering cue is wanted. Keeping the fill also stops the mark
  being read as *"this block has changed"*.
- **The destination is the piece's outline with nothing inside it.** The first cut
  filled it with a wash of the accent and it read as another piece, in both
  schemes; `SKIP` as the body colour leaves `drawPiecepart` painting only the
  bevel bands, which trace the shape exactly. An empty outline reads as a space
  shaped like the piece, which is what a destination is. That also answers the
  author's other half — "the shadow blends in too well with the piece lowlights"
  — by taking the shadow out of the greys altogether.

## D4. Extracting the dark-mode pass, and the three rows in the advisory report

The change adds two `paletteSwaps` pairs. Nothing checked any of them, and the
failure mode is the one the `ts-engine` spec already names: the game renders
correctly in one scheme and incorrectly in the other, with nothing failing.

Writing that test found that the rule had no owner — `puzzle-view.ts` applied it
inline and `scripts/checks/colour-dark-check.test.ts` carried a second copy under
the comment *"Keep in step with it"*. It is now `src/puzzle/dark-palette.ts`, with
both callers on it, and `dark-palette.test.ts` asserts the invariant a swap exists
to provide: **highlight lighter than its surface, lowlight darker, in both
schemes.**

**One over-reach, caught by running it.** The first version derived every game's
trio from the convention "a pair `[a, a+1]` is the highlight and lowlight of the
base at `a-1`", and twelve assertions failed: that convention is Slide's layout,
not the collection's. A population defined by a *convention* rather than a fact is
a union of things that are not all the same thing. The test now asserts the bevel
invariant only for Slide, whose layout is stated in its own renderer, and for
every other pair asserts what is true without knowing the layout — both indices
exist, they differ in lightness, no index is named twice. Establishing the layout
for Mines and Twiddle is worth doing and is not this change's job.

**`npm run diff` gains three rows**, all of them Slide's, all of them
`paletteSwaps` members, and none of them a defect. The check measures ΔL from the
board per index, and a swapped index does not denote the same role in the two
schemes — so it is comparing a highlight with a lowlight. The bevel's real
obligation is to its own surface, and that is now asserted directly. Rather than
leave three unexplained rows, the report marks them **swap**, says why the number
does not mean what it means elsewhere, and points at the test that does state it.

## D5. Overlap with `add-slide-keyboard-control`

That change adds a keyboard cursor and a selected-block mark to the same renderer.
This one lands first, so its marks are chosen against the ladder above rather than
against the flat board. Two notes for whoever writes it:

- **Blue, green and orange are all spoken for** — key block, exit, Solve route.
  `palette.ts`'s `CURSOR` and `HELD` are both `GREEN`, which this board has given
  to the exit, so the cursor needs a different answer here.
- **A new bevel trio needs a `paletteSwaps` pair**, and `dark-palette.test.ts`'s
  Slide block is where to add it. Appending past index 22 is the rule
  (`ts-engine`: "A game's palette index order is stable").
