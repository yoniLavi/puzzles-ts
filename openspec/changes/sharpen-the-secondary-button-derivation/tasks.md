# sharpen-the-secondary-button-derivation — tasks

Scaffolded 2026-09-07 by `close-the-consumed-probe-blind-spot`, whose task 2.2
measured the softness but correctly declined to fix it in that change.

## 0. Read the sixteen before designing anything

- [ ] 0.1 Read the `RIGHT_BUTTON` arm of each of `abcd ascent crossing guess keen
      map mathrax rome salad samegame seismic signpost slide solo towers undead`
      and classify it: a genuine two-step secondary meaning, a meaning with
      nothing to act on under this probe, or a bare repaint. **Read them; do not
      write a heuristic** — sixteen function bodies cost less than the two
      heuristics that lied about them last time (AGENTS.md, "when the population
      is small enough to read, read it").
- [ ] 0.2 Three are already done and should be re-checked rather than trusted:
      Samegame (clears a selection), Solo (`pressNoteTakingCell`, pencil mode),
      Map (both buttons pick).
- [ ] 0.3 **Note which of the sixteen have no `RIGHT_BUTTON` token in their own
      source.** Solo is one — its secondary meaning arrives through a shared
      helper. That set is the reason a source scan cannot be the derivation, and
      it is worth knowing its size before anyone proposes one.

## 1. Decide, on the evidence

- [ ] 1.1 If every one of the sixteen is legitimate, the finding is a
      *sensitivity* result, not a defect list. Say so.
- [ ] 1.2 Look for an observable shared by the two-step meanings and absent from
      a bare repaint tail — the candidate is "the press changes what a subsequent
      input does". Prove it separates Samegame and Solo from an Ascent-shaped
      tail before building on it.
- [ ] 1.3 **Closing with no code change is a permitted outcome**, provided the
      measured sensitivity is recorded where the guard's reader will see it. A
      guard whose comment claims more than its assertion delivers is the defect
      this repo names most often; correcting the comment fixes that much.

## 2. Whatever is decided, record it

- [ ] 2.1 `ts-engine`: the "A game with no secondary meaning is not given a
      synthetic one" requirement describes a biconditional sensitivity it does
      not have for 16 of 57 games. Correct it either by sharpening the guard or
      by stating the bound.
- [ ] 2.2 `docs/games/input.md` § "A touch hold arrives as the right button" —
      the same, in followable form.

## Standing constraints

- [ ] C1 **"Commits a move" is not the answer.** It is the question
      `audit-input-mode-parity` rejected after four false convictions, and it
      would convict 16 games here immediately. It is a fine *diagnostic* — it is
      how the soft set was found — and it must not become the assertion.
- [ ] C2 **No roster, no manifest.** A per-game "this game's secondary meaning is
      two-step" declaration is the exact shape AGENTS.md refuses: it can be
      forgotten by a new game, left behind by a changed one, and nothing
      notices. If intent genuinely cannot be observed, attach it to a derived
      member with a ledger, the way `NO_KEYBOARD` and `INERT_PANEL_KEYS` do.
- [ ] C3 **Nothing is wrong today.** All 57 flags are correct, and the seven
      declaring games are exactly the seven that never consume `RIGHT_BUTTON`.
      Do not write this up as a live defect, and do not let a sharpened guard
      turn a correct game red without reading it first.
