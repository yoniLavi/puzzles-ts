# Tasks — audit-input-mode-parity

**The findings live in [`audit.md`](./audit.md).** This file records what was
done; that one records what was found.

## 1. Build the instrument, and check it first (D2)

- [x] 1.1 Coverage derived **mechanically through the registry** and a real
      `Midend`, never by grepping `index.ts` — verified on Palisade and Separate
      (cursor via `border-grid.ts`, no `CURSOR_*` in their own files, correctly
      scored covered) and on Loopy and Cube (no shared helper).
- [x] 1.2 Every sweep carries a **live-target count** and fails per game when it
      is zero. The gesture sweep also asserts a collection-wide floor
      (>1000 live gestures), so a change that made every probe miss cannot pass.
- [x] 1.3 Totals asserted against the **registry**, not the catalog —
      `sweptGames === REGISTERED.length`.
- [x] 1.4 **Instrument checked before the findings, and it was wrong four
      times** — Rectangles convicted twice, Abcd/Crossing once, Fifteen once, all
      by a probe that measured "the board did not change". `audit.md`
      § "Instrument corrections" has the full account; the rule that replaced it
      ("ask whether the button was *consumed*, and prime anything that needs
      something to act on") is now in the guard's header and in
      `docs/games/input.md`.

## 2. Sweep 57 games × 3 modes

- [x] 2.1 **Mouse**: 57 OK.
- [x] 2.2 **Touch**: press (already guarded, still green), gesture equivalence
      (new, 0 findings), long-press promotion (**7 BROKEN**), two-finger tap
      (same seven), and the gesture layer itself (`src/utils/touch.test.ts`, 15
      cases where there were none).
- [x] 2.3a **Both outputs owed to `unify-cross-game-vocabulary`** are in
      `audit.md`: (a) **30 of 57 games have no test that presses an arrow key** —
      named — and the note that `input-parity.test.ts` now presses one for all 57
      through a real `Midend`, which is what gives that rename a net; (b) the
      first-arrow-press split, **47 reveal-and-move / 5 reveal-only / 4
      direct-action / 1 ignored**, with the five named.
- [x] 2.3 **Keyboard**: 56 OK, 1 BROKEN (Loopy). Every one of the 56 has a
      keyboard-only sequence that *commits a move*, not merely a cursor that
      moves. Keypad bindings checked as a convenience route, not the only one; no
      new findings.
- [x] 2.4 Every cell recorded in `audit.md` with its verdict; the one exemption
      list entry (Loopy) carries its reason there, in the guard, and in the
      `loopy` spec.
- [x] 2.5 Browser pass (Chrome, `playwright-cli`), chosen for gesture variety:
      Pegs mouse drag, Pegs **touch press-hold-drag** (the repaired gesture,
      verified in both directions), Flip held tap, and Mines + Pattern as the
      "must not change the other modes" control.

## 3. Extend the guards

- [x] 3.1 Gesture-level touch equivalence for every registered game.
- [x] 3.2 The long-press case, as the `ignoresSecondaryButton` biconditional —
      sharper than "does the promoted gesture still work", which is unanswerable
      because a right-button eraser correctly does nothing on a fresh board.
- [x] 3.3 Keyboard reachability, with the exemption list and the
      commits-a-move half.
- [x] 3.4 **Every new guard proved to fail**, by breaking the thing it guards and
      watching it go red:
      - remove the midend's `MOD_STYLUS` strip → **12 games** red on gesture
        equivalence (the nine-game shipped defect plus three later ports);
      - flip `ignoresSecondaryButton` on Mines and off Pegs → both red, plus the
        roll-up;
      - take Loopy off `NO_KEYBOARD` → red, plus the list check;
      - disable Flip's select handling → red on commits-a-move;
      - add a bogus key to Solo's panel → red on panel reachability.

      **One breakage did *not* fire, and that was a hole in my guard, not a
      false alarm**: deleting a `requestKeys` hook outright passed, because the
      panel-count floor sat comfortably below the population. A game that *loses*
      its keypad makes every one of its on-screen keys unreachable at once — the
      largest version of the defect — and it was the one thing the sweep could
      not see. The floor is now at the population.
- [x] 3.5 **Emittable-key guard widened**, and it found a live defect the
      previous sweep had missed: **Unruly's erase key was still dead.** Its gate
      called `isEraseKey`, so `DELETE` passed, reached a `switch (button)` whose
      only erase label was `case 8`, matched nothing and fell through. Fixed, and
      anchored by a behavioural test in `unruly.test.ts` (proved to fail).

      Two widenings: `switch (button) { case <code>: }` is now scanned by walking
      each switch's body by brace depth; and **the on-screen panel is a second
      emitter**, so the emittable set is computed **per game** rather than as a
      union — `clearKey`'s button 8 reaches Abcd and does not reach Unruly, which
      is exactly what made Unruly's `case 8` dead. The test previously asserted
      that 8 could not be sent at all, which was false about the frontend as a
      whole.

      The lookup-table shape (`String.fromCharCode(button)`, Sokoban's
      `DIGIT_DIRECTIONS`) was checked and left: its keys are all printable, so
      every one is emittable through the char-code fallback, and no game reaches
      a control code that way.
- [x] 3.6 **The reverse direction is in scope, and it is now a guard**: every
      button `requestKeys` returns must be one the game consumes. One finding
      (Seismic's 6–9), filed. This is D1's actual bar — "the input is reachable"
      rather than "the wiring is connected".

## 4. Fix and file (D4)

- [x] 4.1 Fixed inline: the seven-game long-press defect (one layer down, as one
      flag with a consumer, not seven copies of a workaround); Unruly's dead
      erase key.
- [x] 4.2 Filed with the finding quoted, not a TODO:
      **`add-loopy-keyboard-control`** and **`size-seismic-keypad-to-its-boards`**.
- [x] 4.3 **Loopy decision forced: BROKEN, not EXEMPT.** The bar is maximum
      parity and Slide's precedent is three weeks old; an exemption would be
      claiming a puzzle may ship keyboard-less, which nobody decided. Recorded in
      the `loopy` spec, in the guard's exemption list with its reason, and in
      `help/games/loopy.md`.
- [x] 4.4 Every fix shown not to change the other modes: Mines and Pattern keep
      their promotion in the browser; the whole gesture-equivalence and
      press-level sweeps stay green; `contract-surface.test.ts` and
      `puzzle-hint-stepper.test.ts` follow the renamed relay.

## 4b. The finding handed over from `audit-vestigial-contract-surface`

- [x] 4b.1 **`Game.needsRightButton` removed**, with all eighteen declarations
      and both relay hops; `contract-surface.test.ts`'s `NO_CONSUMER` list is now
      empty. Replaced by `Game.ignoresSecondaryButton`, which
      `view-interactive.ts` really reads.

      **It is not that flag inverted**, and the audit is what could tell:
      `REQUIRE_RBUTTON` means "unplayable without a secondary button" and the
      control needed here means "has no secondary meaning at all". Those differ
      on the largest group — Tracks *uses* the button without *needing* it — so
      inverting would have suppressed a promotion Tracks handles correctly. Nor
      is the upstream knowledge lost in any sense that matters: the new guard
      derives each game's relationship with the secondary button from its own
      behaviour on every run.

## 5. Specs, docs and close-out

- [x] 5.1 `ts-engine`: five ADDED requirements (gesture-level touch guarding, the
      no-secondary-meaning control, the gesture layer's own tests, keyboard
      reachability, on-screen key reachability, the panel as a second emitter)
      and one MODIFIED — the stylus requirement's *"Pattern is the only such
      game"*, false since Loopy landed, with the lesson attached: **a count in a
      spec is a fact that goes stale silently.**
- [x] 5.2 Per-game specs: `loopy`'s "played with mouse or stylus clicks only —
      it has no keyboard input" was the collection's one normative statement of a
      mode gap, and it stated it as a fact rather than a defect. Rewritten to
      record it as an open defect naming the change that owns it. No other game's
      spec claims a mode it does not have.
- [x] 5.3 `docs/games/input.md` updated as a live wiki: the five automatic
      sweeps and what each will tell you, what no sweep can tell you, the
      probe-writing rule the four false convictions produced, the
      `ignoresSecondaryButton` resolution, the `switch`/panel widenings, the
      panel-sizing rule, and a re-verified checklist. The two traps corrected on
      2026-08-26 were re-read against the frontend rather than trusted.
- [x] 5.4 Help: `features.md` names the seven puzzles where the long-press and
      two-finger gestures are now switched off and says what that buys;
      `games/loopy.md` says how Loopy *is* played and that the keyboard is not
      yet there.
- [x] 5.5 `openspec validate --all --strict` — 80 passed, 0 failed.
- [x] 5.6 Owner acceptance **deferred to a real device, not skipped** (owner,
      2026-08-29): *"I can't actually test and accept touch here on my dev
      machine. We need to deploy it so I could then connect with my phone."*

      That is the honest state of this change's evidence, and worth naming: the
      Chrome pass drove synthetic `PointerEvent`s with `pointerType: "touch"`,
      which exercises the frontend's promotion decision faithfully and proves
      nothing whatever about a fingertip — hit-target size, whether 350 ms is
      the right window for a real hand, whether the repaired Pegs drag *feels*
      like a drag. Design D3 said as much in advance ("not reachable in-process:
      whether the resulting gesture is *usable*"), and the missing half is a
      device, not another test tier.

      Archived on the code's own merits — every new guard was proved to fail by
      breaking what it guards, and the repaired gesture was verified in both
      directions — with the device pass carried, not dropped, by
      `test-touch-on-a-real-device`. That change owes this one an answer.
