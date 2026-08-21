# Audit — vestigial contract surface

Every offer this codebase's engine-facing contracts make, checked against
whether anything takes it up. Four shapes, one verdict per row, evidence in
each. Modelled on `2026-08-01-audit-author-known-issues/audit.md`, for the same
reason: the table has to outlive the sweep that produced it.

**Result in one line: 15 live, 8 dead (7 removed, 1 handed over), 1 missing
capability that was a live player-visible defect, 4 false comments.**

The proposal predicted "mostly live, and that is a fine result". It was right
about the ratio and wrong about where the interest would be. The largest finding
is not a hook nobody implements — **every one of the 31 optional `Game` members
has an implementer** — it is a *parameter* nobody can produce: `redraw` and
`interpretMove` were declared to take `DrawState | null`, and 112 game files
were written against that. And the most consequential finding is a *player*
defect (Sokoban's blank "Custom type…" dialog), reached only because a
single-valued flag was hiding it.

---

## 1. Parameters with one live argument

| # | Subject | Verdict | Evidence |
|---|---------|---------|----------|
| 1.1 | `Game.validateParams(p, full)` | **live** | `Midend.newGameFromId` passes `generating = id[sep] === "#"`; four other sites pass `true`. This is the defect that motivated the audit, fixed by `bound-abcd-generable-sizes`; re-checked here rather than assumed. |
| 1.2 | `Game.encodeParams(p, full)` | **live** | Task 1.2 asked for proof, not belief. `midend.ts` `currentGameId` passes `false` (a descriptive id drops generation-only params); eight other sites pass `true`. Consumed by e.g. `loopy/params.ts:102`, which appends the difficulty char only when `full`. |
| 1.3 | `EngineCore.size(…)`'s `isUserSize` | **dead — removed** | One production caller (`components/view.ts`), passing `true`. The `false` branch capped the tile at the game's preferred size — a job the `maxScale` *setting* already does, and better, by shrinking `maxSize` before the midend sees it. Only tests passed `false`. |
| 1.4 | `EngineCore.size(…)`'s `devicePixelRatio` | **dead — removed** | Worse than single-valued: **unread**. The implementation named it `_dpr`, the one production caller passed a literal `1`, and it was threaded through four layers (`view` → `Puzzle` → `PuzzleEngineSurface` → `TsWorkerPuzzle` → `Midend`) to get there. The dpr's real consumer is `resizeDrawing`. |
| 1.5 | `redraw`/`animLength`/`flashLength`'s `dir` | **live** | `Midend.setupAnimation(prev, state, -1)` on undo; `+1` elsewhere. |
| 1.6 | `EngineCore.executeHint(hideAfter)` | **live** | `puzzle.ts` passes `true` for the Hint-button stepper and `false` (default) for auto-play. |
| 1.7 | `PuzzleStaticAttributes.canConfigure` | **dead — removed** | `Midend.getStaticProperties` produced a **literal `true`**, and `type-menu.ts` was its only reader. Exactly the `full` shape, and further gone: `full` at least *could* be false. Removing it changes nothing a player sees, because the gate never closed — which is the point, and which is how it hid 2.6. |

## 2. Optional `Game` hooks: implementers and consumers

The two counts were taken separately, because they fail differently.

**Implementers — nothing to report, and that is a real answer.** All 31 optional
members have at least one, derived from the live registry rather than a list.
The distribution is worth recording: eleven members have exactly one or two
implementers (`supersededDesc`, `timingState` — Mines; `reference`,
`selectReference` — Dominosa; `serialiseMove`, `deserialiseMove` — Pegs;
`uiUpdateClearsHint` — Crossing, Subsets; `wantsStylusModifier` — Loopy,
Pattern), and the proposal is explicit that one is a consumer.

| # | Subject | Verdict | Evidence |
|---|---------|---------|----------|
| 2.1 | Every optional `Game` member | **≥1 implementer** | Registry sweep over 57 games. Nothing to remove on this arm. |
| 2.2 | `Game.needsRightButton` | **dead — handed over** | Eighteen implementers, **no reader**. The midend relays it into `PuzzleStaticAttributes`, the `Puzzle` constructor relays that into a field, and the trail ends. Its only textual hit outside the games is a **commented-out** line in `view-interactive.ts` explaining why it is *not* branched on ("some puzzles, e.g. Tracks, say they don't *need* the right button, even though they can *use* it"), and the touch affordance upstream's `REQUIRE_RBUTTON` gated is offered to every game unconditionally anyway. Not deleted: `audit-input-mode-parity` is already asking for the per-game control this is half of, and there is no C build left to re-derive eighteen declarations from. → that change's task 4b.1. |
| 2.3 | `Game.difficulty` | **live (test consumer, by design)** | 29 implementers, zero production readers — its consumers are `difficulty-contract.test.ts` and `hint-quality.test.ts`. That is the *stated* reason it exists ("so that a property *about* tiers can be asserted for every tiered game at once"), so the standing check records it as an argued exception rather than pretending it is production surface. |
| 2.4 | `Game.serialiseMove` / `deserialiseMove` | **live — question answered** | Task 5b.1 asked why exactly one game (Pegs) needs it. It doesn't *need* it: every move type in the collection is JSON-safe, which `save-round-trip.test.ts` already asserts for all 57 by round-tripping real input. Pegs' pair is a compactness-plus-early-validation choice. The collection's general answer is now `executeMove`'s `assertNever`/`rejectMove` refusal (`reject-unrecognised-moves`, `e538764`); Pegs additionally refuses at the save boundary. Kept — one implementer is a consumer, and removing it would change a save format, which is player data. |
| 2.5 | `PuzzleEngineSurface.setDrawingFontInfo` | **dead — removed** | **Zero callers since the initial commit** (`6c43fa1`, inherited from puzzles-web) — through `Puzzle`, `TsWorkerPuzzle` and down to `Drawing.setFontInfo`. The font is chosen once, at `attachCanvas`, from computed style. Reinstating it needs a trigger that does not exist either (a font preference); the comment left in `drawing.ts` says to add both or neither. |
| 2.6 | `Game.paramConfig` on **Sokoban** | **missing — fixed** | The one game of 57 with no `paramConfig`, so `getCustomParamsConfig()` returned `{ items: {} }` and its **"Custom type…" dialog opened with no fields in it**. Sokoban's params are exactly `w`/`h`; it now declares `dimensionParamConfig()`. This is a live player-visible defect and it was invisible for two compounding reasons — see §5. |
| 2.7 | `Puzzle.isUnfinished` | **dead — removed** | Set from `catalogData?.unfinished` and read by nobody: the home-screen filter, the other-puzzles menu, the experimental-puzzle warning and the share dialog all read `puzzleDataMap[id].unfinished` directly, which is where the fact lives. |
| 2.8 | `GameDrawing.blitterFree` | **live** | One caller (Map, which recreates its blitter on a size change) against six `blitterNew`s. The other five create once and reuse; `blitterFree` only drops the cached `ImageData`, and GC handles the rest. Correct as is. |
| 2.9 | `GameDrawing`'s other 13 primitives | **live** | All used by games (`drawRect` 509 sites down to `blitterLoad` 6). `startDraw`/`endDraw` are called by the midend, not by games — which is why they read as 2 in a game-only grep, and is the correct arrangement. |

## 3. Unreachable cases in a signature

| # | Subject | Verdict | Evidence |
|---|---------|---------|----------|
| 3.1 | `Game.redraw`/`interpretMove`'s `ds: DrawState \| null` | **dead — removed (the big one)** | See below. |
| 3.2 | `Drawing.setFontInfo(): boolean` | **dead — removed with 2.5** | Its one reader was the dead `setDrawingFontInfo`. |
| 3.3 | `Game.refreshHintStep → null` | **live** | Eleven games return it; `Midend.refreshActiveHint` advances past the step. |
| 3.4 | `Game.supersededDesc → null` | **live** | Mines returns `null` before the first click. |
| 3.5 | `SupersededDesc.privDesc` | **live** | Mines is the only setter; `loadGame` rebuilds state 0 from it. |
| 3.6 | `HintTrackVerdict`'s three arms | **live** | `"onTrack"` produced by fifteen games, `"completed"` by twenty-nine, `"off"` by the midend's own default; all three branched on in `Midend.applyMove`. |
| 3.7 | `lowestSolvingCap → number \| null` | **live (test consumer)** | Branched on in `difficulty-contract.test.ts`; both arms asserted in `difficulty.test.ts`. Same standing as 2.3. |

### 3.1 in full: the null draw state

`Game.newDrawState` was optional, so `redraw` and `interpretMove` were declared
to receive `DrawState | null`. All 57 games implement `newDrawState`, and the
midend creates it in `startFrom` before anything can draw or take input — so the
null arm **cannot be produced**. Written against it:

- **55 `if (!ds) return;` guards** at the top of a game's `redraw`, one per game.
  Inert, and they read as protection.
- **57 `ds?.tilesize ?? PREFERRED_TILE_SIZE` expressions** in `interpretMove`.
  These are the ones worth the change: not inert but a **silent wrong answer**
  in waiting. Were `ds` ever null, the game would map every pointer coordinate
  at the *preferred* tile size instead of the one on screen — clicking the wrong
  cell, with nothing raised. That is the proposal's opening sentence verbatim: a
  latent bug with a plausible name.

Four of the 57 wrote `||` rather than `??`, which also catches `tilesize === 0`
— the state a drawstate is in between `newDrawState` and `setTileSize`. They
were right that the window exists; it is just that the midend never lets anyone
observe it. That invariant was being maintained by three separate call sites
each remembering to write two adjacent lines, so it is now one method,
`Midend.freshDrawState`, and `Game.interpretMove`'s doc states what it therefore
promises.

`newDrawState` and `redraw` are now **required**. Three engine test doubles that
omitted them gained a two-line stub, which is the honest price: a game that
draws nothing is not a game.

**And 176 test call sites passed `null`.** They were the fallback's *only*
callers — so those tests were asserting coordinate mapping against a branch
production cannot reach. They now build the drawstate the midend would have
(`engine/testing/sized-draw-state.ts`), which is both more honest and the thing
the game will actually be handed.

## 4. Comments making a checkable control-flow claim

| # | Subject | Verdict | Evidence |
|---|---------|---------|----------|
| 4.1 | bricks / mathrax / clusters / abcd: *"…because `full` is false there"* | **now true** | The exemplar. `bound-abcd-generable-sizes` made the code match; re-verified here against all four. |
| 4.2 | `components/view.ts`: *"Puzzle.detachCanvas is actually a noop"* | **false — fixed** | It resizes the offscreen canvas to 1×1 to release its backing store, and did so in the C worker too — the claim has been false since `6c43fa1`. The *conclusion* ("don't call it here") is sound for a different reason, which the comment also gave; that reason is now the whole comment. |
| 4.3 | `drawing.ts`: *"Returns true if a non-default font was set"* | **false — deleted with 2.5** | It returned whether one *had already been* set. The caller wanted exactly that (a stale glyph cache), so the code was right and the sentence was wrong — which is what dead code does to its own documentation. |
| 4.4 | `flip.test.ts`: *"tile pinned to preferred (48)"*, *"the tile resolves to 48 for both shapes (the bug-1 trigger)"* | **false — fixed, and it mattered** | See §5. |
| 4.5 | `game.ts`: `needsRightButton` *"the midend reports it for the app shell"* | **misleading — rewritten** | True and beside the point: reporting is not consuming. Now states the finding and names the change that owns it. |

## 5. Two things the sweep found that it was not looking for

**(a) A regression test that had never tested its regression.** Fixing 1.3/1.4
meant touching every `midend.size(…)` call, including Flip's
*"canvasCleared after a same-tile reshape repaints bg + grid lines"* — the guard
for one of this project's most-cited bugs (a reshape rendered full black until
the first click). Two things were wrong. Its comment claimed both shapes
resolved to tile 48 at a flat 1000×1000 viewport; they resolve to **250 and
166**, so the *same-tile* condition the bug needs was never set up. And after
fixing that, gutting `canvasCleared` to a bare `return` **still passed** —
because `newGameFromId` builds a fresh drawstate, so the grid lines the test
counted were produced by the first-draw path, not by the thing under test.

The repair is not a stronger assertion, it is an **arming step**: paint once so
the tile cache is live, assert it *is* live (a second paint draws no grid
lines), and only then clear. Proved to fail against the gutted `canvasCleared`,
then reverted. Generalises: *a cache-invalidation test that never warms the
cache is measuring the first draw.* Same family as `grid.test.ts`'s
`d.edges.length === d.order` — the guard measuring a neighbour of its subject —
and this repo has now hit that family six times.

**(b) Two silent skips, in series, hid a player-visible defect.** Sokoban's
blank Custom dialog (2.6) survived because *both* things that could have caught
it declined to look. `custom-params.test.ts` sweeps every registered game and
opens with `if (!game?.paramConfig) continue;` — so the one game without the
hook was skipped in silence, by the test whose subject is that hook. And the
menu entry that opens the dialog was gated on `canConfigure`, which the midend
answered `true` unconditionally, so nothing upstream noticed either. Neither is
unusual code. Together they are a capability the interface offers, a game that
does not take it up, a sweep that skips what it cannot handle, and a gate that
never closes — and a player who picks "Custom type…" and gets an empty box.

## 6. What now prevents recurrence

`src/contract-surface.test.ts` — every optional `Game` member must have ≥1
implementer *and* ≥1 consumer, with the two reported separately and the
implementer count printed in the failure ("`needsRightButton` (18
implementers)"), because that is the sentence the finding needs to say.

Three things about the instrument, since this audit is entirely about instruments
that measured a neighbour of their subject:

- **Consumers come from the TypeScript AST, not a grep.** `needsRightButton`'s
  only textual hit outside the games is a commented-out line. A grep would have
  passed it; a property-access node cannot be a comment.
- **A relay is not a consumer.** `needsRightButton: this.game.needsRightButton ?? false`
  copies a value into a field of the same name; so does `this.x = x`. Both are
  excluded, or the check passes on the very member that motivated it.
- **But the scan matches names, not types, deliberately.** A `ts.Program` costs
  about a second and would resolve `game.hint` exactly — and would be *less*
  correct here, because a capability reaches its reader through same-named
  relays that change type at every hop, so it would convict `canMarkAll`, which
  a toolbar button genuinely branches on. The price is a false pass on an
  accidental name collision (`config["difficulty"]` is a live one), so the
  errors run one way: it can pass a member that only looks consumed, never fail
  one that is read. Stated in the file.

Both arms were proved to fail — a planted hook nothing implements, and
`needsRightButton` with its exception entry removed — then reverted. A stale
exception entry is caught too: if `needsRightButton` ever gains a consumer, the
entry claiming it has none fails.

`custom-params.test.ts` gained the other half: **no registered game may ship a
blank "Custom type…" dialog**, proved to fail by removing Sokoban's new
`paramConfig`. If a genuinely preset-only game ever arrives, that is the prompt
to decide what its menu should say, rather than to add an exception.

Both carry vacuity floors (member count, scanned-module count, registry size),
and the contract check spot-checks that it read *real* members — `hint` optional,
`executeMove` not — so a parse that found the wrong node cannot report success.
