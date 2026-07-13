# Fix: nine ported games are completely deaf to touch

## Why

`puzzle-view-interactive.ts` ORs `MOD_STYLUS` (0x0800) into the button for any
press, drag or release whose `pointerType` is `touch` or `pen`. Our `Midend`
passes the button straight to `Game.interpretMove` — so a game that tests
`button === LEFT_BUTTON` never matches on a touch device, and silently ignores
every finger.

**Nine shipped games do exactly that**: Flip, Galaxies, Pegs, Blackbox, Dominosa,
Guess, Signpost, Untangle and Inertia. Verified two ways — a sweep of every
registered game's `interpretMove` under a real `Midend`, and end-to-end in the
browser (a synthetic touch tap on Flip left the move count unchanged where a
mouse tap incremented it). Galaxies, the flagship, is among them.

The trap is upstream's: `midend.c` strips `MOD_STYLUS`, does its own
canonicalisation, then hands the bit *back* to the game (`button | stylus`), so
every game is expected to remember to strip it (`net.c` does). Comparing the raw
button is the obvious thing to write, it reads correctly, and it fails only on a
device no test suite exercises. It has now caught nine games out of thirty-two —
a footgun with a 28% hit rate is a bad contract, not nine careless ports.

Found while investigating the owner's report that Inertia no longer responded to
touch. It was never a regression from the Inertia port: those games have been
touch-dead since they shipped.

## What Changes

- **Invert the default.** `Midend.processInput` strips `MOD_STYLUS` before
  calling `interpretMove`, unless the game sets the new
  `Game.wantsStylusModifier` flag. A game with no touch-specific behaviour no
  longer has to *remember* to strip a bit it does not care about. The dangerous
  case becomes the one you have to ask for.
- **Pattern opts in** — it is the only game that wants the bit, cycling a cell
  through its three states on a touch press because there is no right button to
  cycle with. It loses nothing.
- **A collection-wide guard test** (`engine/touch-input.test.ts`): for every game
  in the registry, a touch press must do exactly what the same mouse press does,
  swept across the whole board. It drives a real `Midend`, so it covers a new
  port the day it is registered without anyone remembering this exists. It fails
  on precisely those nine games when the fix is removed.

The nine games themselves need no edit: they compare the raw button, which now
arrives clean.

## Impact

- Affected specs: `ts-engine`.
- Affected code: `src/native/engine/{midend,game,pointer}.ts`,
  `src/native/games/pattern/index.ts`, new `src/native/engine/touch-input.test.ts`.
- Fixes touch input in nine shipped games. No behaviour change on mouse.
