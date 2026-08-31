# size-seismic-keypad-to-its-boards

## Why

**Seismic's on-screen keypad offers nine digits, and four of them can never do
anything.** Found by `audit-input-mode-parity`'s reverse-direction sweep — the
one that asks whether a key the frontend *sends* is received, rather than whether
a code a game *tests* can be sent.

The mechanism is exact:

- `requestKeys` returns `digitKeys(p.mode === MODE_TECTONIC ? 5 : 9)`, so a
  Seismic-mode board gets `1`–`9` plus Clear;
- entry is capped at the pressed cell's region size (`if (n > dsf.size(i)) return
  null`) — upstream's stated design choice, and correct;
- but this fork's generator draws region sizes from
  `SEISMIC_REGION_SIZES = [2, 3, 3, 4, 4, 5]`, so **no board it produces, at any
  preset, has a region big enough for 6, 7, 8 or 9.**

Checked across twelve seeds of the default 6×6 preset: not one accepts any of the
four. So a touch player — for whom the panel is the *only* digit-entry route —
sees nine keys and finds four of them inert, on every board, for ever.

The panel is sized to what the **format** admits (`maxRegionSize` says Seismic
numbers run 1–9), not to what the generator makes, and that gap opened silently
when `replace-seismic-region-generator` chose the size distribution.

## What Changes

**This needs a decision, which is why the audit filed it rather than fixing it:**
the keypad is player-visible, and the two honest options trade against each
other.

- **Size the panel to the generator** (`digitKeys(5)` in both modes, or to the
  distribution's ceiling). Every key on screen works. The cost: a desc a player
  *imports* — hand-written, or shared from some future version with a wider
  distribution — could legitimately carry a size-6 region whose cells a touch
  player then cannot fill, because `requestKeys(params)` cannot see the board.
- **Leave nine and accept four inert keys.** No import can strand anyone; the
  panel keeps lying on every board anybody actually plays.
- **A third shape worth pricing:** let the panel be sized per *board* rather than
  per *params*. `Game.requestKeys(p)` deliberately takes params only ("the keypad
  does not vary with play and the panel reloads only on param change"), so this
  is an engine-contract change, not a Seismic change — which makes it the
  expensive option and possibly the right one if a second game ever wants it.

**Decided 2026-08-31: size it to the generator** — see `design.md`, which also
records the two things that changed the shape of the answer. The bound is
**structural, not empirical** (no region above 5 is constructible, so this is
not a seeding accident), and the fix is **not** `digitKeys(5)`: the real defect
is that `requestKeys` inlines a copy of the *format* bound where the *generator*
bound was wanted, so the number must be **derived** or it will go stale again the
next time the distribution moves.

## Impact

- **Affected specs**: `seismic`, and `ts-engine`'s on-screen-keys requirement if
  the third shape is chosen.
- **Affected code**: `src/games/seismic/index.ts` (`requestKeys`), and the
  `INERT_PANEL_KEYS` entry in `src/engine/input-parity.test.ts` — which is a
  finding under management and must be emptied by this change, not left behind.
- **Player-visible**: yes. Ask before changing it.
- **Risk**: low, and bounded by the guard: `input-parity.test.ts` already asserts
  that every offered key reaches the game, so an over-narrow panel cannot hide
  either.
