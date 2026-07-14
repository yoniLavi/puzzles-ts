# Design — desc supersession in the TS engine

**Status: scaffold; decide before implementing.** Upstream mechanism (midend.c:1763):
`midend_supersede_game_desc(me, desc, privdesc)` just swaps the stored strings and fires
the game-id-change notification; the *game* calls it from inside `execute_move` via a
back-reference to the midend (mines.c:2168, threaded through its `layout` struct).

## The decision: how does a pure-TS game signal supersession without a midend back-reference?

Galaxies' design D5 deliberately avoided giving games a `me` pointer, and every ported
game's `executeMove` is pure. Options:

1. **Post-transition hook (leading).** Optional `Game.supersededDesc?(state): { desc:
   string; privDesc?: string } | null` — the midend asks after every `commitMove`;
   Mines' first-move state carries the generated layout, so the answer is derivable from
   state. Keeps `executeMove` pure; costs one cheap call per move (games without the
   hook: zero).
2. **Richer move result.** `executeMove` returns `{ state, supersede? }` for these
   games. More explicit, but churns the `Game` contract every existing game satisfies.
3. **First-move-only special case.** Narrower than upstream's API but exactly Mines'
   use. Rejected-by-default: upstream keeps it general and a future editor/daily-puzzle
   feature may supersede later than move 1 — but revisit if option 1 grows warts.

## Open questions for the implementer

- Does the existing `ChangeNotification` id-change already reach the app shell on desc
  change, or does `TsWorkerPuzzle` cache the id? (Check `emitIdChange` — it had a
  full-encoding bug fixed once already, `add-ts-custom-params-config`.)
- `privdesc` semantics in the clean save format: upstream serialises the *private* desc
  when present so a save restores the layout without the public desc's obscuring. The
  TS codec should store both, restore preferring `privDesc`.
- Undo past the superseding move: upstream keeps the superseded desc (desc describes the
  *game*, not the position) — mirror that; a restart after supersession restarts the
  real layout (that is the point of the feature).
