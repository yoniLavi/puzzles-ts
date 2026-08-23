# audit-input-mode-parity

## Why

**Owner directive (2026-08-03): maximum parity between mouse, touch and
keyboard.** Nothing in the repository currently establishes that, and the one
time anybody checked, the answer was bad.

`fix-touch-input-stylus-modifier` (2026-07-13) found **nine of the then thirty-two
ported games completely deaf to touch** — Flip, Galaxies, Pegs, Blackbox,
Dominosa, Guess, Signpost, Untangle and Inertia, including the flagship. They had
been that way since they shipped. It was not found by a test; it was found by the
owner reporting that Inertia stopped responding on a phone. A 28% hit rate on a
failure mode that "fails silently, and only on a device no test suite exercises"
is the argument for sweeping deliberately rather than waiting for the next report.

**What that change guarded is narrower than what it found.** `ts-engine`'s "Touch
equivalence is guarded for every registered game" covers a **single press** of
`LEFT_BUTTON` or `RIGHT_BUTTON`: for every game, one touch press does what one
mouse press does. Real play is drags, holds, releases and multi-step gestures,
and none of those are swept. Nor is a single cursor key pressed anywhere in that
file.

**And the guard skips exactly the two games whose touch behaviour is special.**
It excludes any game setting `wantsStylusModifier`, which is the flag meaning
"my touch behaviour genuinely differs" — Pattern (a touch press cycles a cell
through three states, having no right button) and Loopy (a tap must reach all
three line states). The two games with bespoke touch handling are the two the
touch sweep does not check. (The `ts-engine` spec still says *"Pattern is the
only such game"*; Loopy was added later. That sentence is a fix this audit
should make.)

**Below the games, the gesture layer itself is untested.**
`src/utils/touch.ts` — `detectSecondaryButton`, the whole long-press and
two-finger-tap synthesiser, with its 350 ms hold, 8 px threshold and a path that
can delay up to *twice* the hold time when a second finger resets the timer —
has **no test file at all**. And `view-interactive.test.ts`, which does test the
press/release delivery contract carefully, hardcodes `pointerType: "mouse"` in
every one of its event helpers, so no touch path is exercised there either.

**The frontend has four documented traps and no collection-wide check for any of
them.** Playbook §3.8a–d each records a trap that "has already cost this project a
shipped bug", and each imposes a per-game obligation that a port has to remember:

- **§3.8a** — this frontend never sets `MOD_NUM_KEYPAD`, so an upstream binding
  testing `MOD_NUM_KEYPAD | '7'` is a **key that can never fire**, in the C too,
  so it never showed as a parity difference. It bit hardest where the keypad was
  the *only* route to an input: Inertia's diagonal moves were literally
  unreachable for a keyboard-only player.
- **§3.8c** — `detectSecondaryButton` delivers a finger that stays within 8px for
  350ms as `RIGHT_BUTTON`. That kills **any press-and-drag gesture**, because
  "press, pause to aim, then drag" is exactly a press that stays put — so the
  gesture dies precisely when the player stops to think, and only on touch.
  Inertia and Slide each hit it and each fixed it locally.

A trap with a documented per-game obligation and no sweep is a trap that is
live for every game nobody has thought about lately.

**One of those obligations exists because a configuration point does not.** A
game cannot tell the frontend "I have no secondary button, do not long-press
me": `longPress`, `twoFingerTap`, the hold time and the drag threshold are all
*global* user settings bound in `puzzle-screen.ts`, and the `Game` interface's
only touch-related knob is `wantsStylusModifier`. Slide's `asPrimary` fold is a
per-game workaround for a missing per-game control, and its `design.md` says so.
Whether that control should exist is a question this audit is well placed to
answer, having looked at every game that would use it.

**On the keyboard side the picture is better than expected and has two holes.**
Of 57 games, 53 have a real movable cursor (Palisade and Separate get theirs
through `border-grid.ts`, so a sweep reading only `index.ts` would wrongly
convict them), and three are direct-action arrow games where no select key is
wanted (Cube, Fifteen, Sokoban). The holes are **Slide** — a select key bound
only to walking a Solve route, no cursor — and **Loopy**, which has nothing.
Both say so normatively in their own specs. Slide is being closed by
`add-slide-keyboard-control`; Loopy is open, and whether a puzzle *may* ship
without keyboard play is a collection-wide policy call, not a per-game one.

**A related question the sweep should answer rather than assume**: 45 of 57 games
declare no `requestKeys`, so they put no keys on the on-screen keyboard. For a
cursor-driven game that is probably right — a touch player uses the pointer, and
the virtual keyboard exists to supply *character* keys. But "probably right" is
what nine touch-dead games looked like too, and the twelve games that do declare
keys are exactly the ones needing digits. The audit should establish whether any
input is reachable *only* by a physical keyboard.

## What Changes

This is an **audit**, in the shape of `audit-author-known-issues`: sweep
everything, give each finding a verdict, fix what is cheap here, and file the
rest with a clear handoff. The proposal fixes the *method*; the findings decide
the work.

- **Sweep all 57 games × 3 input modes** and record a verdict per cell in an
  `audit.md` that travels into the archive with the change. A game is asked, for
  each mode: can it be *played to completion* in that mode alone, and if not, is
  that a defect, a deliberate exemption with a stated reason, or a gap to file?
- **Extend the collection-wide guard beyond a single press.** The existing sweep
  proves one press; a drag is press → drag → release, and that sequence is what
  the §3.8c trap breaks. Add a gesture-level equivalence sweep for every
  registered game that handles drags, and a long-press-becomes-right-button case.
- **Assert keyboard reachability collection-wide**, in whatever form survives
  contact with the sweep — at minimum, that a game either handles cursor input or
  is on an explicit, justified exemption list, so "no keyboard" is a decision
  somebody made rather than a thing nobody noticed.
- **Fix inline what is one line and obviously right** (the §3.8c fold, a missing
  bare-digit binding), and **file separately** anything that needs a new
  interaction designed — that is the `add-slide-keyboard-control` shape, and
  Loopy is the likely second instance.
- **Record the exemptions honestly.** Some games may have a genuine reason a mode
  cannot be at parity. If so the reason goes in the spec, not in a comment, and
  the help page says how the game *is* played.

## Impact

- **Affected specs**: `ts-engine` gains two added requirements — gesture-level
  touch guarding, and keyboard reachability as a recorded decision. The live
  "Touch equivalence is guarded for every registered game" is **not** rewritten:
  its press-level, whole-board sweep stays true and stays worth having; the
  gesture obligation is an addition to it, not a correction of it.

  One **edit in place** is needed, to be made in
  `openspec/specs/ts-engine/spec.md` when this change is archived, reading the
  live text at that moment:

  > In **"The midend hides the stylus modifier from games that do not want it"**,
  > *"Pattern is the only such game"* is false — Loopy sets
  > `wantsStylusModifier` too, so that a tap can reach all three line states. The
  > sentence names both games. It was true when written and stopped being true
  > when Loopy landed: **a count in a spec is a fact that goes stale silently.**

  Per-game specs as the findings require — several currently contain a normative
  "mouse only" sentence.
- **Affected code**: `src/engine/touch-input.test.ts` and its siblings; whichever
  games the sweep convicts.
- **Player-visible**: yes, wherever a mode is currently broken — that is the
  point.
- **Risk**: the audit itself is read-only. The risk is in the fixes, and it is
  managed by the same rule that governed the touch fix: a change to input
  handling must be shown not to alter what the *other* modes do.
