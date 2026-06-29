# Tasks: Default auto-pencil OFF

> Small owner-requested default flip. Gate: the four games' suites (incl. hint
> suites) green; no snapshot drift.

## 1. Flip the default
- [x] 1.1 `newUi` seeds `autoPencil: false` in Towers, Keen, Unequal, Solo
  (`state.ts`), with a comment naming the owner decision.
- [x] 1.2 The no-`Ui` hint-plan fallback `ui?.autoPencil ?? true` becomes `?? false` in
  each game's `buildSteps` (so a hint with no `Ui` teaches the strikes).

## 2. Tests
- [x] 2.1 Update the four hint tests asserting a default-on placement
  (`autoElim: true`) to expect `autoElim: false`. The explicit `uiOn`/`uiOff` folding
  tests already pin the pref and stay green.
- [x] 2.2 Four game suites green, no snapshot drift.

## 3. Close-out
- [x] 3.1 Full gate green → owner acceptance (dev-server: placing a digit leaves
  row/column notes alone; mark-all 2nd press / hint still clean) → commit + archive.
