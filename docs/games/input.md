# Input: pointer, keyboard, touch

How a game receives input in this frontend, and the traps this frontend has
that upstream never had. Every trap below has already cost this project a
shipped bug — read them before writing a game's input, not after.

Authoritative specs: [`ts-engine`](../../openspec/specs/ts-engine/spec.md) (the
`Game` interface, touch equivalence, on-screen keys) ·
[`app-shell`](../../openspec/specs/app-shell/spec.md) (focus handling).
Related guides: [`mechanics.md`](./mechanics.md) (the `interpretMove` /
`executeMove` contract and `UI_UPDATE`) · [`rendering.md`](./rendering.md)
(drag *previews*, blitters) · [`engine-catalog.md`](./engine-catalog.md) (the
shared helper inventory).

## How a press reaches interpretMove

A pointer or key event lands in `puzzle/components/view-interactive.ts`, which
maps it to an upstream-style button code and hands it through the worker to
`Midend.processInput`, which calls the game's `interpretMove`. Three facts
about that pipeline shape everything below:

- **Button codes and class predicates are shared** —
  [`engine/pointer.ts`](../../src/engine/pointer.ts) exports the
  `LEFT_BUTTON`…`CURSOR_SELECT2` codes, the `isMouseDown` / `isMouseDrag` /
  `isMouseRelease` range predicates (upstream's `IS_MOUSE_*`; 27 ports each
  rewrote the three-constant chain before they were extracted), the `MOD_*`
  masks and `stripModifiers`. Never redeclare `const MOD_MASK = 0x7800`.
- **The midend strips `MOD_STYLUS` before your game sees the button** — see
  § "Touch is stripped for you".
- **Keyboard characters arrive as bare char codes** through the view's
  `puzzleKeyMap`, with consequences upstream never had — see § "The numeric
  keypad never arrives".

## The input-parity bar

**Maximum parity between mouse, touch and keyboard is the collection-wide bar**
(owner directive, 2026-08-03). A game where one mode cannot play to completion
carries either a defect or an explicitly recorded exemption — never an
unexamined gap. The precedent for why this is not paranoia:
`fix-touch-input-stylus-modifier` found **nine of the then thirty-two ported
games completely deaf to touch**, discovered by an owner bug report rather than
a test.

**Five sweeps guard it automatically, all through the live registry and a real
`Midend`, so your game is covered the day it is registered.** You do not have to
remember they exist; you do have to know what they will tell you.

- [`touch-input.test.ts`](../../src/engine/touch-input.test.ts) — a touch
  **press** does exactly what the same mouse press does, comparing the press's
  *effect* on the board. If it fails, your `interpretMove` is comparing a raw
  button somewhere.
- [`input-parity.test.ts`](../../src/engine/input-parity.test.ts) — four more:
  the same equivalence for a whole **press → drag → release gesture**; the
  `ignoresSecondaryButton` biconditional (§ "A touch hold arrives as the right
  button"); **keyboard reachability**, which asks not only whether a cursor key
  is consumed but whether any keyboard-only sequence *commits a move*; and
  **on-screen key reachability**, the reverse direction (§ "The on-screen
  keypad").
- [`emittable-keys.test.ts`](../../src/engine/emittable-keys.test.ts) — the
  source scan for a key that can never fire (§ "The numeric keypad never
  arrives").

**What no sweep can tell you** is whether the resulting gesture is *usable* —
hit targets big enough for a fingertip, a cursor a player can see, a panel
offering the keys the game wants. Those need the browser, and the audit that
built these guards was explicit that the sweep is the net and the browser pass
is what catches what the net's mesh is shaped to miss.

**On writing a probe of your own**, if you ever extend one of these: ask *was the
button consumed*, never *did the board change*. A behavioural probe over generic
geometry can only observe the latter, and there are many innocent reasons for it
— a right-button eraser has nothing to erase on a fresh board, a Clear key on an
empty cell is a legitimate no-op, and Fifteen's gap starts in the corner where
two of the four arrows correctly do nothing. Each of those convicted an innocent
game while `audit-input-mode-parity` was being written.

## The numeric keypad never arrives

**A keypad binding must never be the only route to an input — bind the bare
digits too.** This section said for a long time that "this web frontend does not
set `MOD_NUM_KEYPAD`". **That was false**, and worth stating plainly because the
wrong reason is more dangerous than no reason: `view-interactive.ts` sets the
bit from `event.location === 3`, and has since the initial webapp version, so
`MOD_NUM_KEYPAD | '7'` *does* fire. Cube ships a passing test asserting exactly
that, and Bricks' comment calls the bit "load-bearing for the diagonals" — an
audit acting on the old sentence would have deleted working code as dead.

The real gap is narrower and still real. A numpad key only arrives as a **digit
when Num Lock is on**: with it off, numpad 7 is `event.key === "Home"`, which
`puzzleKeyMap` does not carry and the char-code fallback rejects for being
longer than one character. And a laptop keyboard may have no numpad at all. So
the keypad is a *convenience route*, never the only one.

It bit hardest where it was the only one: Inertia's four diagonal moves are
keypad-or-mouse upstream, so a keyboard-only player literally could not make
them. Accept the bare digits as well as the modified ones (`stripModifiers`,
then look the character up) whenever the game binds no other meaning to those
digits. Exemplar: [`inertia/index.ts`](../../src/games/inertia/index.ts)
(`DIGIT_DIRECTIONS`); guarded by
[`emittable-keys.test.ts`](../../src/engine/emittable-keys.test.ts).

**The same trap, one layer up: a whole feature can hang off a character this
frontend never sends.** Upstream binds Slide's route-walking to
`button == ' '`, but `puzzleKeyMap` maps Space to `CURSOR_SELECT2` and Enter to
`CURSOR_SELECT`, so the bare space character never arrives — a faithful
transcription ships a Solve route that literally cannot be walked, and again
the C build's identical dead binding hides it from any parity comparison.

**Tell:** an `interpretMove` comparing `button` against a **character literal**
(`' '`, `'u'`) or against `MOD_NUM_KEYPAD | …`. Check what `puzzleKeyMap`
actually delivers before porting the comparison; accept the buttons this
frontend does send (keeping the literal too costs nothing). Exemplars:
[`slide/index.ts`](../../src/games/slide/index.ts) (`isStepKey`);
Inertia's route-following accepts `CURSOR_SELECT`/`CURSOR_SELECT2`.

**The erase and cancel keys were the worst instance: fourteen of the
fifty-seven games.** Upstream writes `button == '\b'` (8) to rub something out,
and pairs it with Escape (27) to abandon a drag. This frontend sends **127** for
Backspace, Delete *and* Clear — never 8 — and it used to swallow Escape whole
rather than forwarding it. Ascent (twice; one of them the only way to correct a
typo mid-number), Boats, Bricks, Clusters, Filling, Group, Guess, Rome, Slant,
Sticks, Subsets, Undead and Unruly shipped a dead erase key, and Pearl and
Rectangles a cancel arm in which *neither* code could arrive.

**Never write the codes again.** [`engine/pointer.ts`](../../src/engine/pointer.ts)
exports `isEraseKey` (8 | 127) and `isCancelKey` (27 | 8 | 127); a game with both
meanings tests them in separate branches. Escape reaches games as 27 whenever no
pointer gesture is in flight (`app-shell` spec, "Escape reaches the puzzle when
there is no gesture to cancel").

Two things generalise past keys here, and both cost this project real defects:

- **The repair belonged one layer down.** The dead bindings were in the games,
  but fixing them per-game would have left seven files each carefully testing a
  code nothing sends. When a per-game obligation keeps being got wrong, suspect
  the layer below before writing the same fix an eighth time.
- **A trap that has bitten seven times deserves a mechanical check, not a
  paragraph.** [`emittable-keys.test.ts`](../../src/engine/emittable-keys.test.ts)
  reads the codes the frontend can actually produce and the codes the game
  sources actually test, and fails on a test with no producer. It is a source
  scan on purpose: what is being asserted is that no behaviour exists, which no
  behavioural test can see — a game handed `8` directly handles it perfectly.
- **Two things that scan misses, both found by widening it, one of them live.**
  A **`switch (button) { case 8: }`** is a comparison the regex cannot see, and
  Unruly carried one through the very sweep that fixed fourteen games: its gate
  called `isEraseKey`, so `DELETE` passed the gate, reached the switch, matched
  nothing and fell through to `default` — wired at every level, dead at the last
  one. A `case` cannot call a predicate, so spell **both** codes
  (`case BACKSPACE: case DELETE:`; exemplar `subsets/index.ts`). And **the
  on-screen panel is a second emitter**: `clearKey`'s button is `8`, so the
  emittable set is computed **per game** — 8 reaches Abcd, which offers it, and
  reaches Unruly not at all.

## Touch is stripped for you

**Compare the plain button; touch just works.** The view ORs `MOD_STYLUS`
(0x0800) into every press, drag and release whose `pointerType` is `touch` or
`pen`. Upstream hands that bit straight to each game and expects it to
remember to strip it — a footgun that fired nine times here (`button ===
LEFT_BUTTON` simply never matches `LEFT_BUTTON | MOD_STYLUS`; it reads
correctly, fails silently, and fails only on a device the suite never uses).
So the contract is deliberately inverted from upstream
(`fix-touch-input-stylus-modifier`): **the midend strips `MOD_STYLUS` before
`interpretMove`**, and a game that genuinely gives touch its own behaviour
opts in with `Game.wantsStylusModifier` — see its doc comment in
[`engine/game.ts`](../../src/engine/game.ts) for the full rationale. Pattern
and Loopy are the games that ask (each cycles a cell's or an edge's state on a
tap, having no right button to cycle with). Note what happened to the previous
sentence here, because it is a shape worth recognising: the `ts-engine` spec said
"Pattern is the only such game", and that quietly became false the day Loopy
landed. **A count is a fact that goes stale silently** — name the members
instead.

**Tell:** writing `button & 0x0800` by hand — you want the flag instead. The
collection-wide guard (§ "The input-parity bar") catches a raw-button
comparison the day the game registers.

## A touch hold arrives as the right button

`detectSecondaryButton` (`src/utils/touch.ts`) gives touch a
long-press-for-secondary affordance: a finger that stays within 8 px for
350 ms is delivered to the game as `RIGHT_BUTTON` — and its drag and release
follow suit.

**That kills any press-and-drag gesture, precisely when the player pauses to
aim.** "Press, pause a moment to decide, then drag" is *exactly* a press that
stays put — so the gesture dies only on touch, and only for the player who
stopped to think. Inertia's swipe (hold the ball, drag out the direction, let
go) hit this, and so did **seven more games**: Cube, Fifteen, Filling, Flip,
Flood, Pegs and Sokoban, of which Pegs and Filling are entirely press-and-drag.
Confirmed in Chrome — a Pegs jump held 600 ms before the drag left the board
bit-identical.

Three resolutions, by whether the game uses the secondary button:

- **No secondary meaning at all → declare `Game.ignoresSecondaryButton`**, and
  the view skips `detectSecondaryButton` for your game entirely: no promotion,
  and the press delivered immediately rather than held for the detection window.
  This is the right answer whenever it applies, because it fixes the problem
  where it is rather than teaching every game to survive it.

  **You do not get to choose freely.** `input-parity.test.ts` asserts the
  biconditional — you declare it *iff* your `interpretMove` consumes
  `RIGHT_BUTTON` nowhere on a real board — so it cannot be forgotten by a new
  game or left behind by a game that grows a secondary meaning. It is **not**
  upstream's `REQUIRE_RBUTTON` inverted: a game may *use* the secondary button
  without *needing* it (Tracks), and that third group is the largest.
- **Secondary meaning, but the promoted gesture should do the primary thing →
  fold right onto left** at the top of `interpretMove`. One line; exemplar
  `asPrimary()` in [`inertia/index.ts`](../../src/games/inertia/index.ts).
- **Secondary is meaningful → continue the drag on the button class, not the
  press button.** A drag keyed off `isMouseDrag`/`isMouseRelease` (rather than
  the exact press code) lets a long-press that arrived as `RIGHT_BUTTON` start
  and finish its own right-button drag correctly — the right answer for a game
  like Boats where the secondary button carries meaning and folding would be
  wrong. See § "Drag models".
- **Best of all → put the gesture on the left button too, so the promotion
  never has to happen.** The first two resolutions make the promoted press
  survive; this one means a touch player never triggers it. Galaxies' whole
  association gesture was right-button-only, so on a phone the game's one
  cell↔dot notation was reachable only by holding still for 350 ms and *then*
  dragging. It is now a plain drag, with the right button unchanged for anyone
  who has the habit. The price is that the left button then has two meanings —
  see § "A button with two meanings resolves on the release".

**Tell:** a drag lifecycle that matches `LEFT_DRAG` specifically where
`isMouseDrag` is meant — it strands the touch player whose press was promoted.

**The detector itself is tested** ([`utils/touch.test.ts`](../../src/utils/touch.test.ts)),
which it was not for a long time: a per-game guard proves your game copes with
the decision, never that the decision was right, and those are two different
guarantees. Read it before changing the timings — the 350 ms window, the 8 px
radius, and the second finger's *timer reset* (which makes the worst case twice
the hold time) are each asserted, and `unhandledEvent` is what stops a tap faster
than the detection round trip from losing its release.

## The board keeps the keyboard after a control

**You can rely on this now, but know what it is doing for you.** Pressing a
control — a game-menu command, a `data-command` button, a toolbar button —
hands keyboard focus back to the interactive board view. Before
`fix-board-focus-after-command`, focus stayed on the trigger, so one click
made the board deaf to the keyboard until it was clicked again (Enter reopened
the menu; cursor keys went nowhere).

It matters most to a game whose aid is a *keyboard* loop over a *menu* command
— Inertia's route-following (pick Solve, then press Enter repeatedly to walk
the route) is unusable without it. The normative rule is the
[`app-shell`](../../openspec/specs/app-shell/spec.md) spec's "Pressing a
control gives the keyboard back to the board"; its two carve-outs are a click
that opens a menu (the menu needs the focus) and a keyboard activation of a
button (that player is in the tab order deliberately).

## Keyboard cursors

**Never restate anything `pointer.ts` exports.** Not the button codes, not the
predicates, not a locally-named copy — and not a magic number where a named
button exists (`button === 0x0209` is `CURSOR_UP` with the name hidden in a
comment, where no rename can reach it). This is enforced, not requested:
[`emittable-keys.test.ts`](../../src/engine/emittable-keys.test.ts) derives the
export list from `pointer.ts` itself and fails on any game-local declaration
that shadows one, so a helper added there is guarded on the day it lands.

The rule earns its strictness from history: `isMouseDown` and its two siblings
were promoted after **27** ports had each written their own, five games still
had theirs afterwards, and every dead-key defect in this collection began life
as a local copy of a frontend fact.

**One cursor, one name, one field.** Every game holds its keyboard cursor as
`ui.cursor`, an [`engine/pointer.ts`](../../src/engine/pointer.ts) `GridCursor`
(`x`, `y`, `visible`). Build it with `newCursor(x?, y?, visible?)` and drive it
with:

- `moveCursor(cursor, button, w, h, wrap?)` — **reveal and move in one press**,
  returning whether anything changed. `false` means a non-cursor button, or a
  clamped edge press on an already-visible cursor: return `null` rather than
  `UI_UPDATE` for a press that did nothing.
- `showCursor(cursor)` / `hideCursor(cursor)` — reveal in place (a select press,
  or an arrow the game treats as an *action*), and hide (a pointer took over).
  Both return whether they changed anything, which is usually the `UI_UPDATE`
  answer too.

The lower-level pieces are still there for a bespoke traversal: `cursorDelta`
(button → unit delta), `isCursorMove` (the four-direction range check), and
`gridCursorMove` (the position-only clamp, `null` on a no-op).

**Do not invent a second name for any of it.** `cursor-vocabulary.test.ts`
fails the build for a cursor held anywhere but `ui.cursor`, and it finds one
*structurally* — by its shape, read off `newCursor()` — so an eleventh spelling
is caught as surely as the ten that were there before
`unify-cross-game-vocabulary`.

What genuinely stays per-game is a *traversal* that is not a bounded grid step —
a half-grid cursor, corner-skipping, lock modes, paint-while-traversing — which
keeps its own logic (built on `cursorDelta` if that helps), and whatever the
game does *while* the cursor moves. Note the shape of that split: a game may
legitimately want the cursor to *move* differently, and to *do* something as it
moves; no game has ever wanted to *name* it differently. Tents paints the cells
it passes and Boats drags a fill, both by reading `ui.cursor` either side of a
`moveCursor` call. Palisade and Separate get their half-grid cursor through
[`engine/border-grid.ts`](../../src/engine/border-grid.ts) (whose own
`moveBorderCursor` is named apart from the shared helper because a step there
crosses *half* a cell), so a sweep reading only a game's `index.ts` would
wrongly convict them of having none.

**The first arrow press reveals *and* moves, everywhere**, so a keyboard player
never spends a press on the reveal. `moveCursor` does that for you; the guard is
collection-wide, in `cursor-vocabulary.test.ts`.

The one exception, and it is a rule rather than a per-game licence: **an arrow
that is itself an action still only reveals on the first press.** Pearl's
modified arrow marks a line, Range's shifted arrow dots the cells it passes, and
Sixteen's arrow *is* a slide in its locked and modified modes — a first press
must not move the board out from under a player who cannot yet see where it
would act. Each of those calls `showCursor` and returns early on that path only;
the plain arrow beside it reveals and moves like everyone else's.

**Two games keep something extra beside the cursor, and both are worth copying
rather than re-deriving.** Ascent draws a mouse hover differently from a
keyboard cursor, so it carries `cursorFromMouse` alongside `cursor.visible` and
reads the pair back through two named predicates. Rome's `kmode` says what the
cursor is *armed for* (move / place / pencil) and no longer doubles as whether
it is shown. In both, the shared part is the noun and the game's part is the
verb.

A cursor move that changes only `Ui` returns `UI_UPDATE` (the midend redraws,
notifies, and records no history entry) — the contract is in
[`mechanics.md`](./mechanics.md).

### Giving a drag game a keyboard

**Do not model the keyboard as a second way to move; model it as a second way to
hold.** A press-and-drag game already has the whole machinery — a grab computes
what the held thing can reach, and a release turns "where it is now" into one
move. The keyboard needs no part of that rebuilt; it needs a *cursor* that can
reach the same set. Slide is the worked example
([`slide/index.ts`](../../src/games/slide/index.ts)): `grabBlockAt` and
`releaseGrab` are called by the pointer arm and the cursor arm alike, so a
keyboard journey and the equivalent drag are the same move by construction
rather than by agreement.

The concrete rules that fell out, each of which had a wrong answer available:

- **Rename the drag state to what it now is.** `ui.dragging` set true by a
  keypress is false documentation, and it propagates: `FG_DRAGGING`,
  `COL_DRAGGING`. Slide's became `grabbed`/`FG_GRABBED`/`COL_GRABBED`.
- **One cell per press, not slide-to-the-end.** Sliding as far as the set allows
  is fewer presses, but it cannot stop *inside* a corridor — so it cannot reach
  every cell the drag reaches, which is the whole point of adding the keyboard.
- **Keep the cursor out of the grab.** A grab is cancelled whenever the board
  moves under it (its reachable set is stale); a cursor is a position on a grid
  whose size did not change. Clearing both in one `cancelGrab` reads to a player
  as a dropped keypress.
- **A pointer press takes the board over.** Hide the cursor, and where the press
  grabs nothing, put down whatever the keyboard was holding — otherwise the grab
  survives under a pointer and the next `LEFT_DRAG` flings it.
- **Test the equality, not the new path.** Asserting the keyboard in isolation
  passes just as happily against the second movement model you were trying not
  to build. Make the same journey both ways and compare the move, the board and
  the move count.

### Giving a geometric game a keyboard

A game whose input is **per-edge on an arbitrary tiling** has no cell for a
cursor to sit on and no row or column for an arrow to step along. Loopy is the
worked example ([`loopy/cursor.ts`](../../src/games/loopy/cursor.ts),
[`loopy-keyboard.test.ts`](../../src/games/loopy/loopy-keyboard.test.ts));
normative: the `loopy` spec, "Loopy is playable from the keyboard alone". What
generalised:

- **Put the cursor on the thing every tiling has.** Every dot has a ring of
  incident edges, and the grid already supplies it in clockwise order
  (`GridDot.edges`). A cursor on a *face* would need "cycle its twelve sides";
  one on an *edge* would need "the edge to the right of this edge", which is
  ill-defined exactly where the game is interesting. Reach an edge as
  (dot, direction) — which is also how a player draws a loop.
- **Arrows walk, and the edge you walked is the one you act on.** The first
  cut had arrows *choose* an incident edge without moving (with a repeat press
  taking the next), and a modifier for travel; the owner's playtest found the
  modifier confusing, and the pen-behind-you model replaced it: a plain arrow
  moves one dot along the edge that best continues that way (nearest in angle,
  within 90° so Up never walks you down), and Enter marks the edge behind you.
  Drawing is walk-Enter-walk-Enter; undrawing is walk back and Enter.
- **Prove coverage under the walk, then measure the residue and cover it.**
  A walk can only choose the edge it walked, so an edge that is never the
  nearest choice from *either* endpoint is unselectable. Break ties in
  **opposite senses for opposite arrows** (Up/Right clockwise, Down/Left
  counter-clockwise): an edge tied at one end is the mirror tie for the
  opposite arrow at the other end, which resolves it the other way — that
  alone took the triangular grid from 120 stranded edges to none. The sweep
  over every preset then found exactly one residue, nine edges on Penrose
  kite/dart (degree-5 dots at 72°), and **Shift+arrow aims without moving**
  (nearest, repeat takes the next) covers those. The test asserts both halves
  separately — walk alone on 22 presets, walk plus aim on the 23rd — so the
  residue is pinned and cannot grow. Plain is *go*, Shift is *look*.
- **Reset the aim's repeat when the arrow changes or the cursor moves**, or
  the second press of a fresh direction skips an edge.
- **The cursor's shape is the game's when the noun genuinely differs.** Loopy
  holds `{ dot, edge, arrow, visible }` under `ui.cursor` — the collection's one
  *name* — rather than the engine's `GridCursor`, because its position is a dot
  index and an arrow press chooses rather than moves. `cursor-vocabulary.test.ts`
  finds cursors by the grid-cell *shape* and so does not see it; the game's own
  test guards it. Do not fake an `(x, y)` to satisfy the guard.
- **Two select keys mirror two buttons; there is no stylus cycle on a keyboard.**
  Enter is the left button, Space the right, the erase key the middle. The
  three-state cycle exists because a finger has no second button; a keyboard
  has three, so it does not need one. Route all of them through the *same*
  function the pointer arm calls (`setEdge`), so autofollow applies identically.
- **Travel is free once arrows walk.** With the walk model there is no
  separate travel key and no auto-advance: walking marks nothing until Enter,
  and the cursor is already at the far end when Enter is pressed. Assert every
  dot is reachable by walking from the start dot.
- **Draw the cursor from geometry.** A disc under the dot and a halo under
  the chosen edge, each painted *beneath* what it highlights so the edge's
  state stays legible; a tier-2.5 capture on an aperiodic tiling pins where
  they land.

## Drag models

Three distinct drag shapes recur across the collection. Pick by what the
*press* decides, and keep the preview rendering concerns in
[`rendering.md`](./rendering.md) (drag previews, the `moves.ts` split,
blitter sprites).

### The accreting-paint drag

The press picks a **paint value**, the drag accretes **an arbitrary set of
cells the pointer passes over**, and the release commits them as one move.
Upstream's shape (`game_ui` carrying `dragtype` + an accreted index list) maps
to two `Ui` fields (`dragType: number`, `drag: number[]`) and a three-phase
lifecycle in `interpretMove`:

- **press** (`isMouseDown`, after bounds-check): reset, pick `dragType` by
  cycling the pressed cell's current value (left and right cycle opposite
  ways), seed `drag` with the pressed cell; return `UI_UPDATE`;
- **drag** (`isMouseDrag`, guarded by `dragType !== -1`): skip a cell already
  accreted, already the drag value, or a no-op clear; else push; `UI_UPDATE`;
- **release** (`isMouseRelease`, non-empty drag): build one move from the
  accreted cells (filtering givens), else `UI_UPDATE`.

The drag continues off the **button class**, not the exact press button, so a
touch long-press that arrived as `RIGHT_BUTTON` (§ "A touch hold arrives as
the right button") continues its own drag correctly. The renderer previews the
drag by recolouring accreted cells in the cache key — put it in the diff key
([`rendering.md`](./rendering.md) § "The tile cache and the diff key").

Exemplars: [`clusters/index.ts`](../../src/games/clusters/index.ts) (the
reference); [`bricks/index.ts`](../../src/games/bricks/index.ts) (confirms the
shape generalises — a single uniform dragtype painted across accreted cells).
**A shared skeleton was evaluated twice and declined twice**: Sticks' drag
machine differs materially (the press picks no paint value — orientation comes
from the drag *axis* via a bounding-box test; each accreted cell stores its
own re-writable value; a matching-line start flips the whole drag into a
clearing drag), so only "accrete + commit on release" is shared — too little
to fix a callback shape over (Sticks `design.md` F7). If a third
Clusters-like consumer appears, revisit against Clusters and Bricks.

One idiom Sticks added: its coordinate conversion is **truncating** division
(`Math.trunc`), not the shared `fromCoord` floor — a pointer just inside the
border maps to row/column 0, as in C.

### A line-fill drag picks a transformation

Boats' drag fills **one row or column**, and the press decides not a paint
value but a `from → to` **pair**: "every square that currently reads `from`,
in the line I drag out, becomes `to`". Four `Ui` fields carry it (`dragFrom`,
`dragTo`, anchor, current) and three rules make it behave:

- **The axis is chosen per drag event, not at the press** — whichever
  coordinate has moved *less* snaps back to the anchor, so a drag can change
  its mind about direction mid-gesture.
- **`from` is a filter, and `'*'` means "whatever is there"** — clearing to
  water with the left button widens `from` to `'*'` so one sweep flattens a
  mixed line; a filtered drag paints only matching squares, which is what
  makes "turn all my guesses in this row into water" a single gesture.
- **A no-op is rejected at `interpretMove`, not by comparing states** — the
  predicate that decides "would this fill change anything?" is the same one
  `executeMove` filters with, so they cannot drift.

The far-edge click target is widened by one so the number row/column is a grab
handle for its line — small, and worth keeping. Because the drag continues off
the button class, a touch long-press water drag works without folding right
onto left — the correct answer for a game that genuinely uses the secondary
button. Exemplar: [`boats/index.ts`](../../src/games/boats/index.ts).

### Other drag shapes

A rectangle-fill drag (Pattern), a piece drag with a sprite (Pegs, Signpost),
and a slide-follow drag (Sixteen, Slide) each keep their own lifecycle; their
*rendering* halves (preview simulation, the `moves.ts` module split, blitter
sprites, cancelling a dangling drag in `changedState`) are in
[`rendering.md`](./rendering.md).

The **aim drag** picks one discrete target, not a set: `Ui` stores the
snapped aim (an octant, a tile), each drag event recomputes it and returns
`null` when it is unchanged (nothing to repaint), an aim where release
would do nothing draws no preview — the absence *is* the feedback — and
release commits **what was previewed**, not the raw release pixel (they
differ exactly on touch lift-jitter, and the player saw the preview).
Exemplars: [`inertia/index.ts`](../../src/games/inertia/index.ts) (the
swipe: octant aim off the ball, walls preview nothing);
[`galaxies/index.ts`](../../src/games/galaxies/index.ts) (the association
drag: snapped drop tile, preview shows the target *and* its 180° partner
because release commits both, legality shared with `executeMove` through
`moves.ts` so preview and commit cannot drift).

Either end of an aim drag can be the one that moves. Galaxies' pair is
(tile, dot), and a press picks whichever end the player put their pointer
on: press a dot and the tile follows the pointer, press a plain cell and
the *dot* does, snapping to the nearest one a release could legally take.
Downstream — the legality predicate, the preview, the commit — is written
in terms of the pair and needs no knowledge of which end moved, so the
second direction costs one `Ui` boolean and two carve-outs (the
"dragged back to where it started is a null move" test must not fire when
the target *is* the source, and there is no arrow to lift off a source
that never had one).

## A button with two meanings resolves on the release

**A press that could be either a click or a drag must not act on the press.**
Galaxies' left button toggles a wall *and* starts an association drag: the
press only records where it landed, travel beyond a few pixels turns it into a
drag sourced from the press point, and a release that never travelled is the
click. Upstream ducked this by putting the drag on the right button — which is
the button this frontend serves worst (see the trap above), so the ducking
costs more here than the disambiguation does.

Two things make it work, and neither is obvious:

- **Measure the release against the press, not a `dragStarted` flag.**
  `view-interactive.ts`'s `cancelPointerTracking` synthesises a drag *and* a
  release at `(-100, -100)` when the pointer leaves the canvas mid-press, so a
  press that never became a drag *will* arrive at a release far from where it
  started. A distance test rejects it for free; a flag needs the case spelled
  out.
- **Claim the press anyway** — see the next section, which is where this cost
  a session.

## A press you do not act on must still be consumed

**Returning `null` from a press is not "nothing to repaint" — it is "I don't
want this gesture", and it costs you every drag event that would have
followed.** `view-interactive.ts` installs `pointerTracking` only
`if (consumed)`, and `Midend.processInput` reports exactly `interpretMove`'s
`null` as unconsumed. A game whose press defers its decision to the release
therefore has to return `UI_UPDATE` from the press even when nothing on screen
changes.

**Tell:** a drag lifecycle that looks right and is never entered — the release
arrives at the *press* coordinates (the frontend never tracked the pointer, so
no move ever updated them), which then reads as a click and does the click's
thing. Galaxies shipped its left-drag this way for the length of one debugging
session: the press toggled a wall, every drag frame was silently dropped, and
the served module was verifiably the new one, so all the obvious suspects —
stale worker, service worker, HTTP cache — checked out fine.

## Round fractional pointer coordinates

**A game that stores pixel-space coordinates in its state must round pointer
input to integers at the boundary.** Most ports convert a pixel to a cell
index via [`fromCoord`](../../src/engine/geometry.ts) (a `Math.floor`), so
this never bites. But `devicePixelRatio` scaling delivers sub-pixel
coordinates where upstream's GUI frontends handed `interpret_move` integers —
and Untangle, which keeps rational vertex positions, threw a `BigInt`
`RangeError` in its exact-integer crossing test on the first in-window
fractional drop. The fix rounds at the input boundary and re-checks the
integer invariant in `executeMove` (the single drag/solve/replay/load
chokepoint), so any bypass fails loudly. Exemplar:
[`untangle/index.ts`](../../src/games/untangle/index.ts)
(`placeDraggedPoint`).

## The on-screen keypad

**Any game upstream gave a virtual keypad loses it unless the port implements
`requestKeys?(params): KeyLabel[]`** — an absent hook means an empty keypad
(correct for games upstream gave none, like Flip). On touch this panel is the
*primary* digit-entry affordance, so it is not optional for a keypad game.
Normative: the on-screen-keys requirement in
[`ts-engine`](../../openspec/specs/ts-engine/spec.md).

- **Digit games use the shared helper.** `digitKeys(n)` in
  [`engine/key-labels.ts`](../../src/engine/key-labels.ts) builds `'1'..'9'`
  then `'a','b',…` past nine, plus the clear key — whose `"Clear"` label is
  load-bearing (it is what the `puzzle-keys` icon map turns into the clear
  icon). Size `n` from params: Solo `c*r`, Keen/Towers `w`, Filling fixed `9`.
- **Match upstream's keypad exactly — including its quirks.** Unequal is the
  cautionary case: it allows order up to 32 and switches to a **`'0'`-based**
  keypad for order ≥ 10, so it gets a bespoke `unequalKeys(order)`, not
  `digitKeys`. Games with explicit labels (Undead's Ghost/Vampire/Zombie)
  carry those strings verbatim.
- **The hook takes `params` only.** The keypad does not vary with play and the
  panel reloads only on param change — don't thread state or ui through it.
- **Test it tier-1.** Pin the returned `KeyLabel[]` for representative params
  in the game's test file; assert the `digitKeys` rollover and any per-game
  quirk.
- **Every key you offer must reach you.** `input-parity.test.ts` sweeps each
  returned button over a real board and fails on one `interpretMove` never
  consumes — the *reverse* of the emittable-key scan, and the difference between
  "the wiring is connected" and "the input is reachable". A dead panel key is not
  a cosmetic surplus: on touch this panel is the only way to type, so it is a
  control that does nothing when pressed.
- **Size the panel to the boards you generate, not to the format — and
  *derive* the bound rather than writing it.** Seismic is the worked example
  ([`seismic/generator.ts`](../../src/games/seismic/generator.ts)
  `maxGeneratedRegionSize`): its format admits digits to 9 but its region-size
  distribution tops out at 5, and entry is capped at the cell's region size, so
  a `1`–`9` panel had four keys that were inert on every board anybody played.
  The interesting half is not the wrong number but how it arose — `requestKeys`
  inlined a copy of the *format* bound where the *generator* bound was wanted,
  and the copy went stale the day the distribution moved, because a literal
  three files away had no way to hear about it. So the keypad now reads a bound
  *computed from the distribution* (`Math.max(...)` over the array, never a
  restated `5`), the structural test asserts every generated region fits it, and
  the format bound's only job is to bound the generator bound. `requestKeys`
  takes params and cannot see the board, so this is a judgement made once — make
  it a derived one, and pin the resulting `KeyLabel[]` so widening the
  distribution *fails a test* rather than silently widening the panel.

Exemplars: the five digit games (`solo`/`keen`/`towers`/`unequal`/`filling`)
and Undead.

## Checklist

- [ ] No comparison against a raw button that could carry `MOD_STYLUS` (the
      registry sweep will tell you).
- [ ] No binding on `MOD_NUM_KEYPAD | …` or a bare character literal without
      checking what `puzzleKeyMap` delivers; bare digits accepted where the
      keypad was a route to an input.
- [ ] No control code compared bare — including inside a `switch (button)`.
      `isEraseKey` / `isCancelKey`, or both `case` labels.
- [ ] Press-and-drag gestures survive a 350 ms hold — declare
      `ignoresSecondaryButton` if the secondary button means nothing to you, else
      fold to primary or key the drag off the button class.
- [ ] A keyboard-only player can play to completion — not merely move a cursor —
      or the exemption is recorded with its reason, in the spec.
- [ ] Keypad games implement `requestKeys`, pin it tier-1, and offer no key the
      game cannot accept on a board it generates.
- [ ] Pointer coordinates rounded at the boundary if state stores pixels.
