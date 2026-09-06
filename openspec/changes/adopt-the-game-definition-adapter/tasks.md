# adopt-the-game-definition-adapter — tasks

Scaffolded 2026-09-04. **No longer blocked — out of things to wait for**, which
is itself the answer. It needed more than one declaration to have produced
something to adapt: `declare-params-and-presets` shipped 2026-09-05 as a helper
a game calls, `declare-the-gesture-table` was withdrawn the same day, and
`declare-the-board-model` was withdrawn on 2026-09-06
(`openspec/postmortems/2026-09-06-board-model-withdrawal.md`). And
`audit-declared-versus-derived-capabilities` has reported: a capability set can
be *derived*, so the capability-manifest diff — the last surviving argument for a
definition object here — needs no manifest.

**So task 0 is now to settle this change rather than to start it**: on its own
stated criterion (did any declaration need to know about another?) the answer
came back "no" four times out of four. Read the proposal's opening block, then
either withdraw with a postmortem or restate what is left. Do not begin tasks
1–4 without doing that first; they are written for an adapter whose premise has
not survived.

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
