# close-the-consumed-probe-blind-spot — tasks

Scaffolded 2026-09-06 by `audit-declared-versus-derived-capabilities`, which
measured the finding but did not fix it. Implemented 2026-09-07.

## 0. Establish the blind spot as a standing measurement first

- [x] 0.1 Explore. Two things came out of it that changed the shape of the
      change: the probe codes were themselves wrong (see 1.2), and the finding
      had stopped being invisible to players nineteen hours earlier (see C3).
- [x] 0.2 **Landed the probe before the fix.** `input-parity.test.ts`, "a game
      does not claim a button it did not act on": every registered game, four
      codes, the keyboard origin plus the full probe grid, `CLAIMS_UNACTIONABLE`
      asserted **exactly equal** to the set found so an entry cannot outlive the
      behavior it excuses. The probe codes' safety is *derived* — no modifier
      bit, no mouse/cursor/cancel/printable code, offered by no game's keypad —
      because assuming it is what produced the wrong finding in the first place.
- [x] 0.3 **Proven to fail, twice.** It caught Ascent on its first run (676
      claims, nothing else in the collection). Planting an unconditional
      `UI_UPDATE` tail in Flood — a clean game — caught that too, at 680 claims,
      while Flood's own 51 tests all passed with the defect in place.

## 1. Read the two games before choosing a fix

- [x] 1.1 **Ascent.** The `UI_UPDATE` tail is *not* gratuitous — it repaints a
      moved cursor, a click that lands outside the grid and clears the UI, and a
      pointer press that mutates selection without producing a move. The defect
      is one level up: the board arm's gate is coordinate-only, and keys arrive
      at `(0, 0)`. Fix is one conjunct requiring an actual pointer button; the
      tail is untouched. `mouseClick` already returns `null` and mutates nothing
      for a non-pointer button, so `ret` is unaffected and only `finishTyping`
      changes — which is correct, since a key with no meaning should not commit
      a half-typed number.
- [x] 1.2 **Sixteen — no defect.** It was an artifact of the probe. `0xE000` is
      `MOD_NUM_KEYPAD | MOD_SHFT | 0x8000` under `MOD_MASK = 0x7800`, and
      Sixteen reads the keypad bit. With modifier-free codes it is clean. The
      task's own warning ("treating the two as one case is the error to avoid")
      was right for a reason it did not anticipate: one of them was not a case.
- [x] 1.3 Not needed — neither game takes fix 2, and fix 2 was not built.

## 2. Restore what the blinded guards were supposed to assert

- [x] 2.1 **Measured by breaking, not by observing green.** With Ascent's
      cursor-key handling disabled outright: under the old gate
      `responds to a cursor key` **passes**; under the fixed gate it **fails**.
      The keyboard-commit check fails either way — it reads a board fingerprint,
      not the consumed flag, so it was never blind.
- [x] 2.2 **`ignoresSecondaryButton` is correct for both, and its derivation is
      still inert for Ascent.** Deleting Ascent's entire `RIGHT_BUTTON` arm
      leaves the guard green, because `RIGHT_BUTTON` is a pointer button and
      still reaches the legitimate tail. The flag's value was therefore
      established by *reading* (right-click cycles a two-candidate cell,
      middle-click clears — a genuine secondary meaning, so correctly not
      declared), which is what C2 asks for at a population of one. Sixteen was
      never fogged and needed nothing. This limit is written into the `ascent`
      spec rather than left as an implied "restored".

## 3. Record it

- [x] 3.1 `ts-engine`: ADDED "A game declines a button it did not act on" — the
      instrument, the derived probe-code safety, and the explicit ban on the
      private-use area.
- [x] 3.2 `docs/games/input.md`: "A button you did not act on must not be
      claimed", placed directly after its mirror image ("A press you do not act
      on must still be consumed"), with the three readers of the return value,
      the coordinate-gate trap, and why upstream's shape does not transfer.
- [x] 3.3 `ascent`: ADDED the pointer-button gate, the reason the tail stays, and
      the honest scope of what the fix does and does not restore.
- [x] 3.4 **Beyond the scaffolded scope**: `app-shell` ADDED a requirement that
      every bare shortcut letter is swept against every game, with
      `shortcuts.test.ts` implementing it. This is the player-facing half of the
      derivation and nothing covered it. It found a third collision — **Tents
      binds `n` to "not a tent"** with the cursor visible — which is legitimate
      and is now recorded rather than silent.

## Standing constraints

- [x] C1 **"Did the board change" was not reopened.** Fix 2 was not built. The
      one place the guard asks it is the opposite direction — a code with *no
      meaning* must leave the board untouched — which has no innocent reading,
      and it is scoped to the unactionable-code probe alone.
- [x] C2 **Read, did not generalize.** Both games' `interpretMove` read in full;
      the `ignoresSecondaryButton` answer for Ascent comes from reading its two
      arms, because no probe can reach it.
- [x] C3 **Superseded, with the reason.** C3 said this reaches no player. It was
      true when written on 2026-09-06 and false from `9b5093cf`
      (2026-09-07 11:13), which derived the app's bare-letter shortcuts from
      this exact return value. Ascent was the one game in the collection where
      undo, redo, New game and Hint were unreachable from the keyboard. The
      instruction not to hunt for a swallowed shortcut was followed and the
      swallowed shortcuts were found anyway, by reading the call site the
      constraint named.
