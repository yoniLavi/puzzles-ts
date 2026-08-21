# Tasks — audit-vestigial-contract-surface

> The artefact is [`audit.md`](./audit.md) — a table with a verdict and its
> evidence per row. **Check the instrument before every count**
> ([[feedback-check-the-instrument]] is not decoration here: this audit's whole
> subject is claims that were true of a neighbour of the thing they described).

## 1. Sweep: parameters with one live argument

- [x] 1.1 Enumerate every boolean/enum parameter on `Game` and on `EngineCore`,
      and for each, list its **actual** call sites and the values passed.
      Enumerated from the interface declarations via the TS AST, not a grep.
      Findings: `size`'s `isUserSize` (one value) and `devicePixelRatio`
      (**unread**) removed; `dir`, `hideAfter` live.
- [x] 1.2 `encodeParams(p, full)` explicitly. **Live, proven**: `midend.ts`
      `currentGameId` passes `false`; consumed by e.g. `loopy/params.ts`.
- [x] 1.3 Record each as live / dead-remove / dead-wire-up — audit.md §1.
- [x] 1.4 *(added)* `PuzzleStaticAttributes.canConfigure` — the same shape one
      layer up, and worse: the midend produced a literal `true`, so the "Custom
      type…" gate never closed. Removed, and it was hiding task 2.4.

## 2. Sweep: optional `Game` hooks

- [x] 2.1 Implementers and consumers counted separately. **Every one of the 31
      optional members has an implementer** — nothing to report on that arm.
      Consumers: `needsRightButton` has none (18 implementers),
      `setDrawingFontInfo` and `Puzzle.isUnfinished` have none at all.
- [x] 2.2 Instrument guard. Consumers are derived from the **TypeScript AST**,
      because `needsRightButton`'s only textual hit outside the games is a
      commented-out line — a grep would have passed it. A same-named relay
      (`x: this.game.x ?? false`, `this.x = x`) is excluded, or the check passes
      on the very member that motivated it.
- [x] 2.3 *(added)* `Game.paramConfig` — Sokoban had none, so its Custom dialog
      opened blank. Fixed, and asserted across the registry.

## 3. Sweep: unreachable return and parameter cases

- [x] 3.1 Engine functions returning a union or `| null`, each arm checked for a
      branching caller. All live (`refreshHintStep`, `supersededDesc`,
      `lowestSolvingCap`, `HintTrackVerdict`'s three arms) **except** the one
      the sweep was not expecting: `redraw`/`interpretMove`'s
      `ds: DrawState | null`, a case the engine cannot produce, with 55 dead
      guards and 57 silent-wrong-answer fallbacks written against it. See
      audit.md §3.1.

## 4. Sweep: comments that make a checkable control-flow claim

- [x] 4.1 Swept `src/engine/`, `src/puzzle/`, and every game's
      `validateParams`/`executeMove`.
- [x] 4.2 Four false claims found; each made true rather than deleted, except
      the one whose subject was removed. audit.md §4. The `full` trio
      (Bricks/Mathrax/Clusters, plus ABCD) re-verified as **now true**.

## 5. Act

- [x] 5.1 Removals and fixes applied. One is player-visible — Sokoban's Custom
      dialog now has fields — and it is a defect being fixed, not a change of
      behaviour, so it needed no prior sign-off. Nothing else changes anything a
      player can observe: `canConfigure` was already always true, and `size`'s
      removed arguments were already always the same values.
- [x] 5.2 Two members argued kept-without-a-production-consumer, each with its
      argument recorded in `contract-surface.test.ts` in the
      `feedback-probe`-`equivalent` style: `difficulty` (consumer is a
      cross-game guard, by design) and `needsRightButton` (finding under
      management, owned by `audit-input-mode-parity`).

## 5b. Two findings handed over from `reject-unrecognised-moves` (2026-08-21)

- [x] 5b.1 **`Game.serialiseMove`/`deserialiseMove` has one implementer.**
      Question answered rather than hook deleted: it isn't *needed* by anyone —
      every move type in the collection is JSON-safe, which
      `save-round-trip.test.ts` already asserts for all 57 — so Pegs' pair is a
      compactness-plus-early-validation choice, not a necessity. The
      collection's answer to a foreign move is now `executeMove`'s
      `assertNever`/`rejectMove` refusal; Pegs additionally refuses at the save
      boundary. Kept: one implementer is a consumer, and removing it would
      change a save format, which is player data.
- [x] 5b.2 **`notifyChange` hand-rolled `assertNever`.** Replaced with the
      helper; the `@ts-expect-error` form built its message from a value the
      compiler had just been told was `never`, so it named neither the
      notification nor where it came from.

## 6. Prevent recurrence

- [x] 6.1 [`src/contract-surface.test.ts`](../../../src/contract-surface.test.ts)
      — every optional `Game` member has ≥1 implementer and ≥1 consumer, both
      derived (registry, AST), both reported separately, with the implementer
      count in the failure message. Plus
      `custom-params.test.ts`'s "no game ships a blank Custom type… dialog".
- [x] 6.2 Proved to fail, then reverted: a planted hook nothing implements (both
      arms fired); `needsRightButton` with its exception entry removed
      (*"needsRightButton (18 implementers)"*); a stale exception entry;
      Sokoban with its new `paramConfig` removed. Separately, the strengthened
      Flip reshape test was proved to fail against a gutted `canvasCleared` —
      which the version before it did not.
- [x] 6.3 Vacuity guards: interface-member count (plus a spot check that it read
      *real* members — `hint` optional, `executeMove` not), scanned-module
      count, registry size.

## 7. Close out

- [x] 7.1 `ts-engine` spec delta — three ADDED requirements (no capability
      without a consumer; a game is handed a draw state, never the absence of
      one; no game ships an empty custom-params dialog). `ADDED` throughout, so
      nothing can be dropped by omission.
- [x] 7.2 `docs/games/mechanics.md` (the optional-member rule and its converse,
      the non-null sized `ds`, `paramConfig` now asserted, `needsRightButton`'s
      real status) and `docs/games/rendering.md` (sizing).
- [x] 7.3 Owner acceptance (2026-08-21), then archive.
