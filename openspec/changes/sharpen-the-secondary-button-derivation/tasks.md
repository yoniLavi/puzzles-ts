# sharpen-the-secondary-button-derivation — tasks

Scaffolded 2026-09-07 by `close-the-consumed-probe-blind-spot`, which measured
the softness but correctly declined to fix it in that change. Implemented the
same day, at the owner's request, with the framework-level framing they asked
for.

## 0. Read the sixteen before designing anything

- [x] 0.1 All sixteen read. **Every one is legitimate**, and they fall into two
      shapes: **nine** (`abcd crossing keen mathrax salad seismic solo towers
      undead`) reach their secondary meaning through the shared
      `pressNoteTakingCell` — right-click is the pencil-mode press; the other
      seven are per-game (Ascent cycles a two-candidate cell, Guess toggles a
      peg hold, Map treats both buttons alike, Rome starts a pencil drag,
      Samegame clears a selection, Signpost grabs a chain backwards, Slide
      **folds right onto left** via `asPrimary`). So this was a sensitivity
      result, not a defect list — exactly as the proposal predicted.
- [x] 0.2 The three earlier reads re-checked and unchanged.
- [x] 0.3 **Nine of the sixteen have no `RIGHT_BUTTON` token in their own
      source** — all nine of the `pressNoteTakingCell` games. That is more than
      half the population, and it is the concrete reason a source scan could
      never be this derivation.

## 1. Decide, on the evidence

- [x] 1.1 Recorded: no game was at fault, and the seven that declare the flag
      are exactly the seven with no secondary meaning.
- [x] 1.2 **An observable shared by all three shapes was found, and it is one
      question rather than three cases**: *did the secondary gesture change
      anything the player can perceive, now or next?* Committing a move,
      changing what the next input does, and folding onto the primary button are
      all instances of it. `secondaryMeaning` in
      `src/engine/testing/input-probe.ts` asks exactly that.
- [x] 1.3 Not taken — a real sharpening was available, so closing with only a
      corrected comment was not the honest outcome.

## 2. Whatever is decided, record it

- [x] 2.1 `ts-engine`: MODIFIED the secondary-button requirement to state the
      derivation, and ADDED the shared-probe requirement.
- [x] 2.2 `docs/games/input.md` § "A touch hold arrives as the right button".

## 3. Framework level, per the owner's directive

- [x] 3.1 **`src/engine/testing/input-probe.ts`** — the behavioral input probes
      the collection's guards share: `probeBoard`, `probePoints`, `fingerprint`,
      `observable`, `UNACTIONABLE`, `unactionableClaims`, `secondaryMeaning`.
      Both `input-parity.test.ts` and `shortcuts.test.ts` now build their board
      and ask their questions through it, instead of each carrying a copy.
- [x] 3.2 **Convention over configuration**: nothing is declared and there is no
      roster. A game joins a population by *having* the behavior — which is why
      nine games get full credit for a secondary meaning they never mention,
      through a shared helper.
- [x] 3.3 **The observation is the painted frame plus the save**, not the save
      alone. Guess keeps its peg holds in `GuessUi` and never serializes them;
      a save-only probe scored it "no secondary meaning" and would have demanded
      the flag from a game that has one.

## 4. Prove the sharpened guard actually fails

- [x] 4.1 **The decisive comparison.** Replace Samegame's secondary meaning with
      a bare `return UI_UPDATE` — a game with no secondary meaning that still
      answers the button. **Old question ("was it consumed"): green. New
      question: red**, naming the game and what it failed to do. That is the
      whole gap, demonstrated on one defect rather than argued.
- [x] 4.2 Deleting Ascent's `RIGHT_BUTTON` arm alone does **not** turn the guard
      red, and that is correct: its right-*drag* erase arm is separately
      reachable, so the game still has a secondary meaning. Worth recording
      because it looks like a miss and is not.
- [x] 4.3 **A bound, stated rather than papered over.** A game whose secondary
      press has an incidental side effect shared with the primary press — Ascent
      hides the keyboard cursor on any mouse-down — is credited on that alone.
      Removing *both* of Ascent's real secondary arms still leaves the guard
      green for that reason. The remaining gap is narrow (the effect must be
      genuinely observable, so a bare repaint no longer qualifies) and closing it
      needs a "does the secondary do something the primary does not" comparison
      that Slide's deliberate fold would fail. Recorded in the spec.

## 5. Fix what the refactor exposed

- [x] 5.1 The bare-letter sweep was **seed-fragile**: it tested one cursor
      position, and Tents' `n` is legal on any square but a tree, so moving to
      the shared board changed which games it reported. It now walks the cursor,
      which is what the population-finding guards elsewhere already do.

## Standing constraints

- [x] C1 **"Commits a move" did not become the assertion.** The ban is on using
      its *negation* as a conviction ("the board did not change, therefore this
      input is dead"), which is unsound because an eraser on a fresh board
      correctly changes nothing. Here a change is only ever a *sufficient* sign
      that the button means something; a game is reported meaningless only when
      it is invisible under **every** observation. The asymmetry is what makes
      this safe, and it is stated in the probe's own doc comment.
- [x] C2 **No roster, no manifest.** Nothing was added to any game.
- [x] C3 **No correct game turned red.** The partition is unchanged — 50 games
      have a secondary meaning, 7 do not, and the 7 are exactly the 7 that
      declare the flag. What changed is what would be caught tomorrow.
