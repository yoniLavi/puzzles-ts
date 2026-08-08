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
a test. The collection-wide sweep establishing this bar for every game × every
mode is the active change
[`audit-input-mode-parity`](../../openspec/changes/audit-input-mode-parity/proposal.md);
until it lands, the per-game obligations in this guide are what stand between a
port and the same silent failure.

What is already guarded automatically:
[`engine/touch-input.test.ts`](../../src/engine/touch-input.test.ts) sweeps
**every registered game** through a real `Midend`, asserting a touch press does
exactly what the same mouse press does — comparing the press's *effect* on the
board, not merely whether it was consumed. Your game is covered the day it is
registered. If it fails, your `interpretMove` is comparing a raw button
somewhere.

## The numeric keypad never arrives

**This web frontend does not set `MOD_NUM_KEYPAD` — bind the bare digits too.**
The view's `puzzleKeyMap` handles arrows/select/delete and then falls through
to "any single character → its char code", so a number-pad `7` reaches
`interpretMove` as the plain character `'7'`, never as `MOD_NUM_KEYPAD | '7'`.
An upstream binding that tests the modified form is a **key that can never
fire** — and the C build had the identical dead binding, so it never showed as
a parity difference either.

It bites hardest where the keypad is the *only* route to an input: Inertia's
four diagonal moves are keypad-or-mouse upstream, so a keyboard-only player
literally could not make them. Accept the bare digits as well as the modified
ones (`stripModifiers(button)`, then look the character up) whenever the game
binds no other meaning to those digits — a deliberate divergence that costs
nothing and restores the input. Exemplar:
[`inertia/index.ts`](../../src/games/inertia/index.ts) (`DIGIT_DIRECTIONS`).

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
and Loopy are the only games that ask (each cycles a cell's state on a tap,
having no right button to cycle with).

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
go) hit this.

Two resolutions, by whether the game uses the secondary button:

- **No secondary meaning → fold right onto left** at the top of
  `interpretMove`, so the gesture works whichever button the long-press
  detector decided it saw. One line; exemplar `asPrimary()` in
  [`inertia/index.ts`](../../src/games/inertia/index.ts).
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

**Use the shared helpers for the common shape; keep policy local.**
[`engine/pointer.ts`](../../src/engine/pointer.ts) provides:

- `cursorDelta(button)` — button → unit grid delta, `null` for non-cursor keys;
- `isCursorMove(button)` — the four-direction range check;
- `gridCursorMove(button, x, y, w, h, wrap?)` — the bounded (or toroidal)
  cursor clamp. It returns `null` on a non-cursor button **and** on a
  clamped-edge no-op, so `?? { x, y }` reproduces the "always returns a
  position" shape.

Per-game policy stays per-game, deliberately: which `Ui` field holds the
cursor, `changed`-tracking, the "first arrow-press only reveals the cursor"
idiom, and the `null`-vs-`UI_UPDATE` return. A non-trivial traversal — a
half-grid cursor, corner-skipping, lock modes, paint-while-traversing —
keeps its own logic (built on `cursorDelta` if that helps). Palisade and
Separate get their half-grid cursor through
[`engine/border-grid.ts`](../../src/engine/border-grid.ts), so a sweep reading
only a game's `index.ts` would wrongly convict them of having none.

A cursor move that changes only `Ui` returns `UI_UPDATE` (the midend redraws,
notifies, and records no history entry) — the contract is in
[`mechanics.md`](./mechanics.md).

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

Exemplars: the five digit games (`solo`/`keen`/`towers`/`unequal`/`filling`)
and Undead.

## Checklist

- [ ] No comparison against a raw button that could carry `MOD_STYLUS` (the
      registry sweep will tell you).
- [ ] No binding on `MOD_NUM_KEYPAD | …` or a bare character literal without
      checking what `puzzleKeyMap` delivers; bare digits accepted where the
      keypad was a route to an input.
- [ ] Press-and-drag gestures survive a 350 ms hold (fold to primary, or key
      the drag off the button class).
- [ ] A keyboard-only player can play to completion, or the exemption is
      recorded with its reason.
- [ ] Keypad games implement `requestKeys` and pin it tier-1.
- [ ] Pointer coordinates rounded at the boundary if state stores pixels.
