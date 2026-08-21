# Tasks — sweep-sibling-contract-surface

## 1. Sweep the app-facing contracts mechanically

- [x] 1.1 Point the audit's AST scan at `EngineCore`, `PuzzleEngineSurface`,
      `Puzzle`, `PuzzleStaticAttributes`, `Drawing` and `ReferenceItem`.
      **Clean apart from the three below** — every member of the four
      engine-facing ones has a reader.
- [x] 1.2 Check the instrument on its own output rather than trusting the count.
      It matched `this.<name>` only, so three `private static` members read as
      `ClassName.field` came back as write-only and are not findings
      (`domToPuzzleButtons`, `buttonToButtons`, `QUICK_SAVE_FILENAME`). Read the
      hits; do not report the number.

## 2. Act

- [x] 2.1 `PuzzleStaticAttributes.displayName` removed; `Puzzle` reads
      `puzzleDataMap[puzzleId]?.name` directly.
- [x] 2.2 `Midend.winSize` removed; `size()` returns the value it computed.
- [x] 2.3 `Puzzle.detachCanvas` made private (`delete()` is the only caller).
- [x] 2.4 Recorded as deliberately not done: `preferredTileSize`, `setTileSize`
      and `paramConfig` are optional-and-universal, but no *game* pays for the
      optionality, which is what made `newDrawState`/`redraw` worth changing.

## 3. Widen the guard

- [x] 3.1 `contract-surface.test.ts` sweeps `PuzzleStaticAttributes`, scoped to
      app-shell reads.
- [x] 3.2 Proved to fail: re-adding `canConfigure` reproduces the exact finding
      the audit removed, then reverted.
- [x] 3.3 Vacuity guards: field count, a spot check on a real field name, and
      the number of app-shell modules scanned.
- [x] 3.4 State the limitation. This catches the `canConfigure` shape (nothing
      reads the name) and not the `displayName` shape (something reads the name,
      but the value never arrives from here). The second is a dataflow question
      that tsc already answers — an unused destructured binding in the `Puzzle`
      constructor is an error — and what hid `displayName` was that the binding
      *was* used, in a fallback that could not fire.

## 4. Close out

- [x] 4.1 `ts-engine` spec delta (ADDED).
- [x] 4.2 `docs/games/mechanics.md` — the optional-and-universal criterion, and
      a pointer to the sibling contract.
- [ ] 4.3 Owner acceptance, then archive.
