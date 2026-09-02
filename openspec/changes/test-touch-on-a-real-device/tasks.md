# Tasks — test-touch-on-a-real-device

**Blocked on `deploy-the-web-app`.** There is nothing to do without a URL.

Findings go in `device-report.md` alongside this file, with a verdict per item,
and it travels into the archive with the change — the same shape as the input
audit's `audit.md`. **A clean pass is a real outcome; record it as one rather
than padding it.**

## 1. The seven games the audit repaired

Each gets its own verdict. The gesture to try is the one that was broken:
**press, hold still for about a second, then act** — that is precisely what used
to be thrown away.

- [ ] 1.1 **Pegs** — press a peg, pause to choose a landing square, drag, lift.
      The hardest case and the one the fix was verified against in Chrome; if
      the repair shows anywhere, it shows here.
- [ ] 1.2 **Filling** — press, pause, then drag across a run of cells.
- [ ] 1.3 Cube · 1.4 Fifteen · 1.5 Flip · 1.6 Flood · 1.7 Sokoban — a held tap
      must act. Each was previously inert when held.
- [ ] 1.8 For any that still feels wrong, say **which** of the two it is: the
      gesture is still being swallowed (a defect in this change's scope), or it
      responds but feels sluggish/imprecise (a timing or hit-target finding).
      They have different fixes and the report should not blur them.

## 2. The control group — the other modes must not have moved

The audit's rule 4.4, carried onto hardware.

- [ ] 2.1 **Mines** — right-button flagging by long press and by two-finger tap
      must still work. It keeps the promotion deliberately.
- [ ] 2.2 **Pattern** and **Loopy** — the two games with bespoke touch handling
      (`wantsStylusModifier`), where a tap cycles through three states because
      there is no second button. Most likely to surprise.
- [ ] 2.3 **Tracks** — uses the secondary button without declaring it needs one.
      It is the game that made "invert `needsRightButton`" the wrong answer, so
      it is worth confirming the reasoning held.
- [ ] 2.4 Mouse and keyboard on a desktop browser against the *deployed* build,
      once, so a deploy-only regression cannot hide behind "we tested on a
      phone".

## 3. What no in-process sweep could reach (audit design D3)

- [ ] 3.1 **Hit targets.** Can a fingertip reliably hit a Loopy edge, an
      Untangle vertex, a Bridges island, a Palisade border? Untangle first — its
      vertices sit at arbitrary points, which is exactly what defeated an early
      cut of the press sweep.
- [ ] 3.2 **The on-screen keypad on a small screen.** Twelve games have one, and
      on touch it is the *only* way to type. Check it is reachable, legible and
      not covering the board: Solo (ten keys), Undead (bespoke labels), Salad.
- [ ] 3.3 **The keyboard cursor**, if a phone keyboard is attached or on a
      tablet — the audit proved 56 games can be played by keyboard alone, and
      nobody has seen the cursor on a small screen.
- [ ] 3.4 **Screen sizes and orientation.** Portrait and landscape, one small
      phone and one tablet if available. Board scaling, the app bar, the toolbar.

## 4. The PWA, which has never met a phone

Record what works **before** deciding what to add. Whether more is needed is a
finding here, not a premise.

- [ ] 4.1 **Install** to the home screen, and launch from that icon. Check the
      name (it is `VITE_APP_NAME`, which `deploy-the-web-app` sets — otherwise
      it installs as "Puzzles web app") and the icon.
- [ ] 4.2 **Offline.** Turn the network off and open the app cold. Then start a
      new game offline, and reload mid-game.
- [ ] 4.3 **Update flow.** `registerType: "prompt"` — deploy a second build and
      confirm the prompt appears and applies. This is the one most likely to be
      subtly broken and the one nobody notices until an update needs to ship.
- [ ] 4.4 **Backgrounding.** Switch apps mid-game and come back; check a timed
      game (Mines) and a quick-save survives.
- [ ] 4.5 **Preflight.** `src/preflight.ts` gates older browsers to
      `unsupported.html`. Confirm a supported phone is not caught by it — a
      false positive here is a blank app on a real device.
- [ ] 4.6 **Then** decide what is missing. Candidates, none to be built before
      the device asks for them: an app-controlled install prompt, safe-area
      insets on a notched screen, wake-lock for a timed game, manifest shortcuts
      or share-target, orientation lock.

## 5. The gesture constants, against a hand

- [ ] 5.1 `secondaryButtonHoldTime` (350 ms) and `secondaryButtonDragThreshold`
      (8 px) are inherited defaults, never measured against a thumb. Both are
      user-settable, so the question is whether the *default* is right.
- [ ] 5.2 If either wants changing, `src/utils/touch.test.ts` pins the behavior
      they drive, so the change is cheap and guarded. Note in the report which
      device the judgment was made on — a threshold is device-dependent and a
      single phone is not a population.

## 6. Close out

- [ ] 6.1 Fix inline what is local and unambiguous.
- [ ] 6.2 File anything needing an interaction designed, with the finding
      quoted rather than a TODO.
- [ ] 6.3 `ts-migration` spec: touch acceptance is a device activity, and the
      in-process tiers plus a synthetic-pointer browser pass are not it.
- [ ] 6.4 `help/features.md` if any touch affordance turns out to need
      explaining to a player.
- [ ] 6.5 `openspec validate test-touch-on-a-real-device --strict`.
- [ ] 6.6 **Owner acceptance of the seven repaired games** — the item the input
      audit deferred, and the reason this change exists.
