## 1. Engine

- [x] 1.1 Export `MOD_STYLUS` from `engine/pointer.ts`.
- [x] 1.2 Add the optional `Game.wantsStylusModifier` flag (default false),
      documenting why the default is inverted from upstream's.
- [x] 1.3 `Midend.processInput` strips `MOD_STYLUS` unless the game sets it.
- [x] 1.4 Pattern opts in (it cycles a cell's state on touch) and drops its
      local `MOD_STYLUS` constant for the shared one.

## 2. Guard

- [x] 2.1 `engine/touch-input.test.ts`: for every registered game, sweep the
      board and assert a touch press does what a mouse press does. Include the
      vacuity guard (a game whose probes all fell on dead space would pass
      trivially — Untangle did, until the sweep was made dense enough to hit a
      vertex).
- [x] 2.2 Confirm it fails on exactly the nine broken games when the midend fix
      is removed, and passes with it.

## 3. Verification

- [x] 3.1 Dev-verify in a real browser with synthetic touch pointer events:
      Flip, Galaxies and Inertia all now register a touch tap (move count
      increments) where they previously ignored it.
- [x] 3.2 Full gate green.
- [x] 3.3 **Owner acceptance** → archive.
