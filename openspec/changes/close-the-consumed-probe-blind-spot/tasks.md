# close-the-consumed-probe-blind-spot — tasks

Scaffolded 2026-09-06 by `audit-declared-versus-derived-capabilities`, which
measured the finding but did not fix it.

## 0. Establish the blind spot as a standing measurement first

- [ ] 0.1 `/opsx:explore`.
- [ ] 0.2 **Land the probe before landing a fix.** Turn the measurement in the
      proposal into a real guard: no game reports `consumed` for a private-use
      code it cannot handle. Ledger the two known games with their reason so it
      goes green today, and the ledger's honesty check is what turns each fix
      into a deletion from the list. Doing this first means the fix has a red
      test to turn green, rather than being believed.
- [ ] 0.3 **Prove it fails**: give a clean game an unconditional `UI_UPDATE`
      tail, watch it get caught, restore.

## 1. Read the two games before choosing a fix

- [ ] 1.1 **Ascent.** The `UI_UPDATE` is the tail of `finishTyping` in `ui.ts`
      (`if (finishTyping && !ret) return UI_UPDATE`). Establish what repaint it
      is actually there for — the typing buffer's caret/preview is the
      suspicion — and whether an unrecognized button can be split off from a
      genuine typing commit. **Do not assume it is gratuitous**; the whole reason
      this is an investigation is that it might not be.
- [ ] 1.2 **Sixteen.** Independent read; it may be a different mechanism with a
      different answer, and treating the two as one case is the error to avoid.
- [ ] 1.3 If either genuinely needs the repaint, that game takes fix 2 and says
      so in its spec, rather than being bent to fit the guard (AGENTS.md:
      game-specific logic is never contorted to fit a contract).

## 2. Restore what the blinded guards were supposed to assert

- [ ] 2.1 With the games no longer fogging it, confirm `input-parity.test.ts`'s
      keyboard-reachability and `ignoresSecondaryButton` checks now say something
      about Ascent and Sixteen — **by breaking each and watching it fail for
      those two specifically**, not by observing that the suite is still green.
      A guard that was vacuous and is now merely passing looks identical.
- [ ] 2.2 Check whether `ignoresSecondaryButton` is currently *wrong* for either
      game. It has never been tested for them, so its present value is a guess
      that happened to satisfy an inert check — and a wrong value there drops
      every long press and two-finger tap a touch player makes.

## 3. Record it

- [ ] 3.1 `ts-engine`: the input guards' instrument, and the rule that a game
      does not claim a button it did not act on.
- [ ] 3.2 `docs/games/input.md` — the trap, next to the four frontend traps.
- [ ] 3.3 Per-game spec note for whichever game keeps its behavior, with the
      reason.

## Standing constraints

- [ ] C1 **Do not re-open "did the board change".** The repo already rejected
      that question — it falsely convicted four games
      (`audit-input-mode-parity`), and the memory of *why* is the reason
      "consumed" is the question the guards ask. Any instrument change must be
      scoped to the two games that fog the answer, not applied collection-wide.
- [ ] C2 **Two games is the whole population, so read them rather than
      generalizing.** AGENTS.md: when the population is small enough to read,
      read it. There is no need for a heuristic here.
- [ ] C3 **This reaches no player today** — `processKey`'s return value is
      discarded at both frontend call sites. Do not write the change up as a
      swallowed-shortcut bug, and do not go hunting for one; the cost is entirely
      to the guards.
