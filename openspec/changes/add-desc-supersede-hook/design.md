# Design — desc supersession in the TS engine

Upstream mechanism (midend.c:1763): `midend_supersede_game_desc(me, desc, privdesc)` swaps
the stored strings and fires the game-id-change notification; the *game* calls it from
inside `execute_move` via a back-reference to the midend (mines.c:2168, threaded through
its `layout` struct). Mines is the only caller.

## D1. The hook is a *pull*, not a push — `Game.supersededDesc(state)`

Option 1 of the scaffold, adopted. The C shape is impossible here on purpose: Galaxies'
design D5 refused to give games a midend back-reference, and every ported game's
`executeMove` is pure. So the engine asks instead of being told:

```ts
supersededDesc?(s: State): { desc: string; privDesc?: string } | null
```

"What game description describes the board this state belongs to?" — a *derivation*, not
an event. Mines' post-click state carries the layout it just generated, so the answer is
derivable from state alone, and `executeMove` stays pure. The midend calls it from
`commitMove` (the single path every real move goes through — `processInput`, `playMoves`,
`solve`, load-replay) and adopts the answer when it differs from the stored desc.

Rejected: **option 2** (a richer `executeMove` result) — it churns the one contract all 37
ported games satisfy, for one game. **Option 3** (a first-move-only special case) — it is
exactly Mines' use but not upstream's semantics, and buys nothing over the general form.

## D2. `null` means "nothing to say", never "revert"

The one rule that makes a state-derived hook safe. Undo past Mines' first click lands on a
state with no layout, whose honest answer is `null` — and if the midend read that as a
bidirectional derivation it would *un*-supersede, handing out a game ID for a board nobody
is playing. Upstream never reverts: a desc describes the **game**, not the position. So
the engine only ever upgrades, and only from `commitMove` — never on undo/redo/restart.

## D3. `set_public_desc` — deliberately NOT ported (the no-go)

Upstream's `Game` struct has a *second* member for this: `set_public_desc(state, pubdesc)`,
called on deserialise after state 0 is built from the private desc, so Mines can recover
the first-click coordinates from the public desc (they drive the "start here" cross when
you undo to the start). It is needed there because mines.c records `startx/starty` *only*
inside the "generating the layout" branch of `open_square` — so a replay from a
privdesc-built state 0, where the layout already exists, never runs it.

A TS port does not have to inherit that defect: it can record the click coordinates in the
state on the first click *whether or not* it generated the layout there, and the replayed
move log restores them. The fake game in `desc-supersede.test.ts` does exactly this (its
`clickedAt: s.clickedAt ?? m.click`), and the "restored save" test proves state 0 comes
from the private desc without any public-desc hook.

So it is declined, not deferred — an engine API with no adopter is how `PointerAction`
shipped and had to be removed. If the Mines port finds it genuinely needs the public desc
at state 0, adding it is ~10 lines in `loadGame`, where the midend already holds both
descs.

## D4. Restart rebuilds from the public desc — but only for a superseding game

Upstream restarts from `me->desc` rather than `states[0]`, with the comment: "that way
Mines gets slightly more sensible behaviour (restart goes to _after_ the first click so
you don't have to remember where you clicked)" (midend.c:991).

For every non-superseding game `history[0]` **is** `newState(params, desc)`, so upstream's
form is a no-op for them — but calling `newState` for all 37 games to reproduce a value
they already hold would be a gratuitous behaviour change on a hot path. The midend
therefore tracks a `descSuperseded` flag and takes the rebuild branch only when it is set.

## D5. Save format: `privDesc` is additive and optional

`SaveEnvelope` gains `privDesc?: string`, no version bump — the field is absent for every
game that does not supersede (i.e. all of them today), and a save written before this
change still validates. On load, state 0 is rebuilt from `privDesc ?? desc`: the public
desc bakes in a first click the move log is about to replay, and replaying it against a
board that already has it would open the square twice. The public desc is then restored
over the top, because *it* is what the game is and what the shareable ID names.

## D6. The id-change notification already reaches the app (open question, answered)

Checked end-to-end rather than assumed. `emitIdChange` → `ChangeNotification` →
`puzzle.ts` `game-id-change` → the `_currentGameId` signal → `puzzle-context` dispatches
the same `puzzle-game-state-change` a move already dispatches. Nothing caches the desc and
nothing re-navigates, so a mid-game supersession refreshes the shareable ID with no other
effect. (`puzzle-view` also schedules a redraw on a game-id change — harmless: the move
that superseded is repainting anyway.)

## Not covered here

The Mines port itself, including whether its layout generator's RNG lives in state (it
must, for the move log to replay deterministically — the fake game asserts the shape, not
the generator).
