# sharpen-the-secondary-button-derivation

**Readiness: investigation, with the population measured and bounded.** Nothing
is wrong today — this is about a guard being softer than the thing it claims to
assert, which is this repo's most-repeated defect and is invisible by
construction. What is open is whether a sharper derivation exists that does not
reopen a question the repo has already rejected.

Found 2026-09-07 while closing `close-the-consumed-probe-blind-spot`, whose
task 2.2 asked whether the `ignoresSecondaryButton` biconditional had been
restored for Ascent. It had not, and the reason turned out not to be about
Ascent.

## The finding

`input-parity.test.ts` asserts the biconditional *a game declares
`ignoresSecondaryButton` if and only if it consumes `RIGHT_BUTTON` nowhere*. It
measures "consumes" as `interpretMove` returning non-`null`. Measured across all
57 games, driving a real `Midend` over the full probe grid, both on a fresh board
and after a left press primes the cell, and reading `totalMoves` from the change
notification to tell a committed move from a repaint:

| `RIGHT_BUTTON` … | Games |
| --- | --- |
| commits a move | 34 |
| is consumed but **never commits a move** | **16** |
| is never consumed | 7 |

The 7 are exactly `cube fifteen filling flip flood pegs sokoban` — exactly the
seven that declare the flag. **So the flag is correct for all 57 games right
now**, and the guard's `expect(declared).toEqual(observed)` says so.

The 16 are the soft set: `abcd ascent crossing guess keen map mathrax rome salad
samegame seismic signpost slide solo towers undead`. For each of them the
biconditional is satisfied by a *repaint alone*, so it would report a secondary
meaning whether or not one existed.

## Why this is a latent weakness rather than a bug

Three of the 16 were read to establish the set's character, and all three are
**legitimate two-step secondary meanings** that genuinely cannot commit a move on
the press:

- **Samegame** — right-click clears a selection; the move commits on a later
  left press.
- **Solo** — right-click is the pencil-mode press, via the shared
  `pressNoteTakingCell`; the digit that follows is the move. (Note it has no
  `RIGHT_BUTTON` token in its own source at all, so a grep-based census would
  score it deaf — the trap the keyboard-reachability requirement already names.)
- **Map** — left and right both pick, deliberately.

That is almost certainly the story for most of the 16, and the change must not
assume otherwise. But the *shape* the softness permits is not hypothetical:
Ascent's `finishTyping` tail returned `UI_UPDATE` for any in-grid pointer button,
so deleting its entire right-button arm left the guard green. Ascent happens to
have a real secondary meaning; a game with the same tail and no secondary meaning
would sail through, and its touch players would lose **every long press and
two-finger tap, and every press-and-drag gesture the moment they pause to aim**.
That is the exact defect the original sweep found in seven games at once.

## What is genuinely open

1. **Whether a sharper derivation exists at all.** "Commits a move" is *not* it —
   that is the question `audit-input-mode-parity` rejected after it falsely
   convicted four games, and 16 of 57 here would be convicted on the spot. C1 of
   the parent change stands.
2. **Whether the two-step meanings share an observable shape.** Samegame and Solo
   both consume the press and change what a *subsequent* input does. If that is
   derivable, it separates them from a bare repaint tail without a roster.
3. **Whether it is worth it.** The honest alternative is to leave the guard as it
   is and record its measured sensitivity, so the next reader does not over-trust
   a comment that reads stronger than the assertion. That is a legitimate
   outcome, and it should be reached deliberately rather than by default.

## Impact

- Affected specs: `ts-engine` ("A game with no secondary meaning is not given a
  synthetic one" — its guard paragraph describes a sensitivity it does not have
  for 16 games).
- Affected code: `input-parity.test.ts`; no game unless the read finds one.
- **Not player-visible today.** The flag is correct for all 57 games; this is
  about what would be caught tomorrow.
- **Bounded.** The population is 16 and they are readable, which is what the
  investigation should do before designing anything.
