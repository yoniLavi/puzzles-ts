# Audit — 57 games × 3 input modes

The sweep this change exists to run, with a verdict per cell. It travels into the
archive with the change, because the *findings* are the deliverable and the
proposal is only the method.

**Bar (design D1): reachability.** Every input the game accepts is reachable in
every mode, and a player using one mode alone can play a board to completion.
**OK** = reachable, checked. **BROKEN** = not reachable and should be.
**EXEMPT** = not reachable, deliberately, with the reason *in the spec*.

## Headline

| | Mouse | Touch | Keyboard |
|---|---|---|---|
| OK | 57 | 57 (after the fix) | 56 |
| BROKEN | 0 | **7**, all fixed here | **1** (Loopy), filed |
| EXEMPT | 0 | 0 | 0 |

Two further defects fell out that are not a mode column: **Unruly's erase key was
dead** (fixed here) and **four of Seismic's nine on-screen keys can never do
anything** (filed).

## What was swept, and with what

Everything below is derived through the **live registry and a real `Midend`**, so
a game is covered the day it is registered rather than the day somebody
remembers. The permanent form is `src/engine/input-parity.test.ts` (243 cases);
`src/engine/touch-input.test.ts` keeps the press-level sweep it already had.

The sweep is **frontend-faithful**, which is load-bearing: `view-interactive.ts`
installs `pointerTracking` only `if (consumed)`, so a press returning `null` never
receives its drag. A sweep that sent the drag anyway would score Galaxies'
shipped left-drag bug — press consumed nothing, every drag frame silently
dropped — as healthy.

### Instrument corrections (D2), which are findings in their own right

**Four false convictions, all the same shape**, and each was believed for a while:

1. **Rectangles** scored "right-button gesture completely dead" (341/341 probes).
   Its right-drag is the **eraser**; on a fresh board there is nothing to erase.
2. Re-probed on a written board, Rectangles scored dead *again* — because
   `gridDrawRect(…, outline=false)` clears a rectangle's **interior**, and the
   probe dragged one tile, so the rectangle had no interior.
3. **Abcd and Crossing** scored "the Clear key on the touch panel is inert".
   Clearing an already-empty cell is a legitimate no-op.
4. **Fifteen** scored "no keyboard sequence changes the board". Its gap starts in
   the top-left corner, and the probe's cursor walk only ever pressed
   `CURSOR_RIGHT` and `CURSOR_DOWN` — the two directions that are correctly
   no-ops there.

The common root: **a behavioural probe over generic geometry can only observe
"the board did not change", and there are many innocent reasons for that.** The
questions that survive are ones a game's semantics cannot make innocent — *was
the button consumed* rather than *did the board change* — and every probe that
needs something to act on is primed first. Both rules are now in the guard's
header comment so the next person does not re-derive them.

This is D2's own advice aimed back at D2. It is also why the proposal's §3.8a
bullet had to be corrected before this audit could act on it: it claimed the
frontend never sets `MOD_NUM_KEYPAD`, and acting on that would have deleted
Cube's and Bricks' working, tested keypad bindings.

## Mouse — 57 OK

Baseline. Every registered game has live pointer targets: the gesture sweep found
**more than a thousand** press → drag → release sequences that a mouse consumes,
distributed across all 57 games, and fails per-game when a game contributes zero
(the guard against the near-miss `touch-input.test.ts` recorded, where an early
cut swept Untangle, hit nothing and would have reported health).

## Touch — 7 BROKEN, all fixed

### 1. A single press: already guarded, still OK

`touch-input.test.ts` compares the *effect* of a touch press against a mouse
press for every game. Unchanged and still green. Its one gap is closed here: it
skipped any game setting `wantsStylusModifier`, which made **Pattern and Loopy —
the two games with bespoke touch handling — the two nothing checked**. The new
gesture sweep does not skip them; it asserts them against what they declare.

*(The `ts-engine` spec's "Pattern is the only such game" was also false. Loopy
sets the flag too. Corrected in the delta: **a count in a spec is a fact that
goes stale silently**.)*

### 2. A gesture: newly guarded, 0 findings

Press → drag → release from a finger leaves the same board as from a mouse, in
every game. Zero mismatches — as it should be, since the midend strips
`MOD_STYLUS`. Proven to fail: removing that strip reddens **twelve** games at
once, which is the nine-game shipped defect plus three ports written since.

### 3. A long press: **7 BROKEN**

**`detectSecondaryButton` promotes a finger that stays within 8 px for 350 ms to
`RIGHT_BUTTON`** — and "press, pause to aim, then drag" *is* a press that stays
put. A game that never tests `RIGHT_BUTTON` therefore drops the entire gesture,
only on touch, and only for the player who stopped to think.

Seven games were in exactly that state:

| Game | What the touch player loses |
|---|---|
| **Pegs** | **The whole game.** It is one press-and-drag; pausing to choose a landing square destroyed the jump. |
| **Filling** | A drag across a run of cells, killed mid-gesture. |
| Cube | A held tap rolls nothing. |
| Fifteen | A held tap slides nothing. |
| Flip | A held tap flips nothing. |
| Flood | A held tap chooses no colour. |
| Sokoban | A held tap steps nowhere. |

**Confirmed in Chrome, both ways.** On Pegs, a synthetic touch press held 600 ms
and then dragged two cells leaves the board *bit-identical* with the fix off, and
completes the jump with it on.

**Fixed one layer down, not seven times over** (design D4's third clause). The
repair is the control the proposal asked for: a game can now tell the frontend
*"I have no secondary button, do not long-press me"* —
`Game.ignoresSecondaryButton`, read by `view-interactive.ts`, which then skips
detection entirely (and so also delivers the press immediately instead of holding
it for the detection window).

It is **guarded as a biconditional**: a game declares the flag **iff** it
consumes `RIGHT_BUTTON` nowhere on a real board. So it cannot be forgotten by a
new game, and it cannot be left behind by a game that grows a secondary meaning.

**It is not `needsRightButton` inverted, and that matters** — see task 4b.1
below. The third category is the largest: Tracks *uses* the secondary button
without *needing* it, so inverting upstream's `REQUIRE_RBUTTON` would have
suppressed a promotion Tracks handles correctly.

### 4. Two-finger tap

Same promotion path, same fix, same seven games. The gesture layer itself
(`src/utils/touch.ts`) had **no test at all** — design D3 called that "a hole
underneath both" guards, since a per-game sweep proves a game copes with the
decision and never that the decision was right. It now has fifteen
(`src/utils/touch.test.ts`), covering the hold, the 8 px threshold, the wobble
inside it, the `unhandledEvent` replay a fast tap depends on, and the
second-finger timer reset that makes the documented worst case *twice* the hold
time.

## Keyboard — 56 OK, 1 BROKEN

**Every game except Loopy responds to a cursor key, and every one of those 56 has
a keyboard-only sequence that commits a move.** The second half is the one that
matters: a cursor that goes everywhere and does nothing is not a keyboard.

Coverage is derived through the `Midend`, never by grepping a game's `index.ts`
for `CURSOR_UP` — **Palisade and Separate have no direct `CURSOR_*` reference and
full cursor handling**, via `border-grid.ts`. A check that read one file would
convict two games that are fine, which is how a guard gets turned off rather than
fixed.

Two-step interactions are why the commit probe is not a single keypress: **Pegs,
Map, Rectangles, Samegame, Signpost, Slide and Untangle** all pick something up
with a select and put it down with a second one, and asking once scores every one
of them deaf.

### Loopy — **BROKEN**, filed (D5)

Loopy handles no cursor key at all: arrows, both selects, erase and cancel are
all ignored. **The choice is forced here rather than left open**, and the verdict
is BROKEN rather than EXEMPT: the standing bar is maximum parity between the
three modes, and Slide — the worked precedent — was closed this month.

It is filed rather than fixed because it is not a binding, it is a design: input
is per-**edge** across eighteen tilings including aperiodic ones, so "move the
cursor to the next edge" has no canonical meaning. Upstream gives it no keyboard
either (zero `CURSOR_` references in `loopy.c`), so the port inherited the
absence rather than choosing it.

→ **`add-loopy-keyboard-control`**, scaffolded. Until it lands, Loopy is on
`input-parity.test.ts`'s `NO_KEYBOARD` list with its reason, and the reason is in
the `loopy` spec — which is the difference between "we decided this" and "nobody
looked".

### The keypad is a convenience route, never the only one

Checked, not assumed. A numpad key only arrives as a **digit with Num Lock on**
(with it off, numpad 7 is `event.key === "Home"`, which `puzzleKeyMap` does not
carry), and a laptop may have no numpad — but the modifier itself *is* set, from
`event.location === 3`, and Cube and Bricks depend on it. Guarded by
`emittable-keys.test.ts`'s pairing rule; no new findings.

## The on-screen key panel — 1 finding, filed

**The reverse direction**, and the one the emittable-key scan structurally cannot
see: that scan asks whether a code a game *tests* can be sent; this asks whether
a code the frontend *sends* is received. On touch the panel is the only
character-entry route there is, so a panel key that reaches nothing is an input a
touch player simply cannot make. Twelve games have panels; sixty-plus keys swept.

### Seismic offers four keys that can never work

`requestKeys` returns `digitKeys(9)` in Seismic mode, and entry is capped at the
pressed cell's region size — but this fork's generator draws region sizes from
`[2, 3, 3, 4, 4, 5]`, so **no board it can produce, at any preset, has a region
big enough for 6, 7, 8 or 9.** Checked across twelve seeds of the default preset:
none. A touch player sees nine digits and four of them are inert on every board.

Not fixed inline, because it is a genuine product decision and it is
player-visible: the panel is currently sized to what the **format** admits
(`maxRegionSize` — a hand-written or imported desc may legitimately carry a
larger region), not to what the generator makes, and `requestKeys(params)` cannot
see the board. → **`size-seismic-keypad-to-its-boards`**, scaffolded. Recorded
meanwhile in `INERT_PANEL_KEYS` as a finding under management, so it cannot
quietly become normal.

## Unruly's erase key was dead — fixed

Found by widening the emittable-key scan (task 3.5). `decideValue` carried
`case 8: // backspace`, and `interpretMove`'s gate called `isEraseKey`, so
`DELETE` (127) passed the gate, reached the switch, matched nothing and fell
through to `default`. **The erase key read as wired at every level and was dead at
the last one** — and it survived the collection-wide erase-key sweep of
2026-08-26, which fixed fourteen games, because that sweep's scan matched
`button === 8` and a `case` label is neither a `===` nor a `const`.

Two widenings, both proven to fail before being trusted:

- **`switch (button) { case <control code>: }`** is now scanned, by walking each
  such switch's body by brace depth.
- **The on-screen panel is a second emitter**, and the previous model of the
  frontend was wrong about this: the test asserted that 8 cannot be sent while
  twelve games' `clearKey` was sending it. The emittable set is now **per game** —
  `clearKey`'s 8 reaches Abcd, which offers it, and reaches Unruly not at all,
  which is precisely what makes Unruly's `case 8` dead. Taking the union across
  the collection would have excused the very defect the scan exists to find.

## Task 4b.1 — `needsRightButton` resolved by removal

Handed over from `audit-vestigial-contract-surface`: eighteen implementers, no
reader. The instruction was *give it a consumer or remove it and the eighteen
declarations together — but do not leave it as surface that reads as a capability
and is not one.*

**Removed**, along with all eighteen declarations and both relay hops
(`PuzzleStaticAttributes`, `Puzzle`). `contract-surface.test.ts`'s `NO_CONSUMER`
list is now empty.

The reasoning, since the alternative was tempting: the control this audit needed
is *"has no secondary meaning at all"*, and `REQUIRE_RBUTTON` is *"cannot be
played without one"*. Those differ on the largest group — the games that can use
the secondary button but do not require it — so `needsRightButton` inverted would
have turned off Tracks' promotion, which Tracks handles correctly. Nor is the
upstream knowledge lost in any sense that matters: the new guard **derives** each
game's relationship with the secondary button from its own behaviour on every
run, which is strictly stronger than eighteen hand-written booleans nothing
checked.

## Task 2.3a — the two outputs owed to `unify-cross-game-vocabulary`

That change is sequenced after this one and would otherwise rebuild both.

### (a) Which games' tests press an arrow key — **27 do, 30 do not**

A behaviour-preserving rename of the cursor `Ui` fields has a green suite in
these thirty games because **nothing in them presses an arrow at all**:

> abcd, ascent, blackbox, bricks, bridges, dominosa, filling, group, guess,
> inertia, keen, loopy, magnets, map, mines, palisade, pattern, pearl, range,
> samegame, seismic, separate, signpost, singles, solo, tents, tracks, undead,
> unequal, untangle

**What changes that, and it is the more useful half:** `input-parity.test.ts` now
presses cursor keys for **all 57** through a real `Midend`, and asserts each one
still commits a move. So the rename does have a collection-wide net under it —
just not a per-game one, and the thirty above are where a per-game assertion
would have to be added if the rename touches anything beyond the field's name.

### (b) First arrow press: reveal-only vs reveal-and-move

Measured off `newUi` + one `interpretMove(CURSOR_RIGHT)`, classified by whether a
**numeric** field changed (moved) or only a flag (revealed):

| Behaviour | Count | Games |
|---|---|---|
| **reveal and move** | **47** | everything not listed below |
| **reveal only** | **5** | pearl, range, signpost, sixteen, tracks |
| **direct action** (the arrow *is* the move) | 4 | cube, fifteen, inertia, sokoban |
| **ignored** | 1 | loopy |

This is a **finding**, not a decision: whether the five should join the
forty-seven is a player-visible call, and it belongs to whoever takes the
unification, with the count in hand rather than assumed.

## Browser pass (task 2.5)

Chrome, via the `playwright-cli` skill, against `npm run dev`. Chosen for gesture
variety rather than alphabetically:

| Game | Gesture | Result |
|---|---|---|
| Pegs | mouse press-drag-release jump | works |
| Pegs | **touch press, 600 ms hold, drag, release** | **fixed** — no change before, jump completes after |
| Flip | touch press with hold | now flips; previously inert |
| Mines | touch press with hold | unchanged (promotion retained — it uses the right button) |
| Pattern | touch press with hold | unchanged (`wantsStylusModifier`, promotion retained) |

The last two are the "must not change what the *other* modes do" check (task
4.4): a game that keeps its secondary meaning must keep its promotion, and both
do.
