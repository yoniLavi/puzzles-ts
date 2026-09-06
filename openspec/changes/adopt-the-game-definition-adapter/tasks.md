# adopt-the-game-definition-adapter — tasks

Scaffolded 2026-09-04. **Blocked**, on two things now. It needs more than one
declaration to have produced something to adapt — `declare-params-and-presets`
shipped 2026-09-05, `declare-the-gesture-table` was withdrawn the same day, so
the second it waits on is `declare-the-board-model`. And it should not be
settled before `audit-declared-versus-derived-capabilities` reports: that survey
tests whether a capability set can be *derived* rather than declared, which
decides whether the capability-manifest diff — the last surviving argument for a
definition object here — needs a manifest at all.

## 1. Co-develop, never build-then-point

- [ ] 1.1 Pick the first game to re-express **before** writing the adapter, and
      pick one that nearly breaks it. A Latin game fits by construction and
      proves nothing.
- [ ] 1.2 Build the adapter and that game's definition together, the way the TS
      midend was co-developed with Flip.

## 2. The guard the sweep will depend on

- [ ] 2.1 **Capability-manifest diff**: the game declares the same capability set
      before and after — hints, mistakes, prefs, keypad, reference aid,
      difficulty tiers. Build it here, not when the sweep starts; the
      characteristic sweep risk is silent capability loss and by then it is too
      late to notice.
- [ ] 2.2 Prove it fails: drop a capability from the re-expressed game
      deliberately and watch the diff catch it.

## 3. Invariants that must not move

- [ ] 3.1 The game's frozen differential is **byte-clean**.
- [ ] 3.2 Narration strings byte-identical (an exemplar hint never loses a word
      to an abstraction).
- [ ] 3.3 Tier-2.5 render snapshots unchanged, or every changed line explainable
      by a declared intent.
- [ ] 3.4 Midend, worker, app shell and save format untouched — that is the
      property that makes this abortable, and it should be *checked*, not
      assumed.

## 4. Be willing to stop

- [ ] 4.1 If the exemplar needs contortion to fit, write the postmortem under
      `openspec/postmortems/` and withdraw. The scene-graph precedent is that a
      recorded withdrawal is a successful outcome, not a failed one.

## Findings

_(none yet — not started)_
