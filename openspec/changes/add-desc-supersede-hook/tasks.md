# Tasks

- [x] 1.1 Decide the hook shape: **post-transition pull** — `Game.supersededDesc(state)`,
      the engine asking "what desc describes this board" after each committed move, with
      `null` meaning "nothing to say" and never "revert". Rationale + the two rejected
      options in `design.md` D1/D2.
- [x] 1.2 Implement the `Game` hook + `Midend` desc/privDesc replacement + id-change
      notification. Verified end-to-end (`design.md` D6): `emitIdChange` → `puzzle.ts`
      `game-id-change` → the `_currentGameId` signal → `puzzle-context` dispatches the
      same `puzzle-game-state-change` a move already does. Nothing caches the desc,
      nothing re-navigates. (No live browser check is possible until a game implements
      the hook — Mines is the first, in its own change.)
- [x] 1.3 Save-codec: `privDesc` added to `SaveEnvelope` (additive + optional, no version
      bump); restore rebuilds state 0 from `privDesc ?? desc` and then restores the public
      desc over it; round-trip tested. `design.md` D5.
- [x] 1.4 Tier-1 behavioural tests (`desc-supersede.test.ts`, 8 tests) against a fake
      Mines-shaped game: supersede fires once and re-announces the ID, a later move does
      not, undo does not un-supersede, restart uses the superseded desc (asserted on the
      restored *board*, not just the desc string), save carries both descs, a restored
      save rebuilds state 0 from the private desc (proved by undoing to it), a pre-click
      save is an ordinary save, and a game without the hook is untouched.
- [x] 1.5 Playbook §3.10 (desc-superseding games) + the long-tail-risk table row flipped
      from "needs a hook" to the hook. Link-only to the `ts-engine` spec.
- [x] 1.6 Gate (`tsc` → lint → vitest → build) + `openspec validate --strict`.
- [ ] 1.7 Owner review of the hook shape before the Mines port builds on it; archive.

## Decided along the way (see `design.md`)

- **`set_public_desc` is declined, not deferred** (D3). Upstream needs that second game
  hook only because mines.c records the first-click coordinates *inside* its
  layout-generating branch, so a replay from a privdesc-built state 0 never runs it. A TS
  port records them on the first click either way and the replay restores them — no engine
  hook needed. Adding one with no adopter is how `PointerAction` shipped and was removed.
