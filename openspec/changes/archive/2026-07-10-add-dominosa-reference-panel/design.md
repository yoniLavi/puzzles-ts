## Context

Dominosa is ported (`src/native/games/dominosa/`, committed `1d9d99f`) with an explained
hint. We want a solution *aid* — a reference table of every domino pair with found status,
and a click-to-highlight of a pair's candidate placements. The seam map (this change's
investigation) established:

- The `canMarkAll` capability chain is the template for a per-game static flag that gates a
  toolbar button: `Game` flag → `Midend.getStaticProperties()` → `PuzzleStaticAttributes`
  (Comlink) → `Puzzle` constructor `public readonly` → `puzzle-history.ts` conditional.
- `Ui` is mutated **only** by `interpretMove` / `changedState` / preference setters. The
  single app-shell → `Ui` channel today is injecting keys/mouse via `processKey`/
  `processMouse`. Dominosa's existing highlight is a stateful two-slot *toggle* driven by
  digit keys — awkward to set to an exact `{a,b}` from a button. A pair-occurrence
  highlight therefore wants a small, clean, explicit push method rather than key injection.
- `Ui` reaches pixels via `Midend.redraw(...)` passing `this.ui` into `game.redraw`; the
  render cache key must fold in every overlay (playbook §3.2).
- `Puzzle` is reactive (`@lit-labs/signals`); `notifyChange` bumps `_currentMove` etc. on
  every transition — a `SignalWatcher` panel can re-fetch the (async) reference model when
  the move counter changes.

## Goals / Non-Goals

- Goals: a discoverable, zero-leak checklist; a click-to-highlight that matches the user's
  ask ("box the occurrences of that pair"); a responsive panel that keeps the board
  interactive on desktop **and** mobile; a generic engine seam so the app shell carries no
  `dominosa` knowledge.
- Non-Goals: a second consumer / full generalisation now; replacing the existing
  number-highlight; making the panel a blocking modal.

## Decisions

- **D1 — Generic reference-aid seam, Dominosa-only implementation.** Add
  `Game.reference?(state, ui): ReferenceModel` and `Game.selectReference?(ui, key): boolean`
  to the interface; surface `hasReference = game.reference !== undefined` in
  `getStaticProperties()`, and add `getReference()` / `selectReference(key)` to
  `PuzzleEngineSurface` (WASM: `hasReference:false`, `getReference:()=>null`). The names live
  in shared infra so `midend.ts` / `worker.ts` / `puzzle-history.ts` never mention dominoes —
  exactly like `canMarkAll`. *Alternative rejected:* a `dominoReference`-named seam — leaks a
  game into the engine surface for no benefit.

- **D2 — `selectReference` is the clean app→Ui push, shaped like `UI_UPDATE`.** It calls
  `game.selectReference(this.ui, key)`; on a `true` return the midend runs the same
  `clearAnimation()` + redraw path a `UI_UPDATE` takes (no move, no history, not serialised).
  *Alternative rejected:* encoding "highlight pair k" as a synthetic keycode through
  `processKey` — abuses the input path and can't express `k > 9` or an exact set given the
  toggle semantics.

- **D3 — `ReferenceModel` is plain, semi-generic data.**
  `{ items: ReferenceItem[]; selected: string | null; columns?: number }`,
  `ReferenceItem = { key: string; label: string; pips?: readonly number[]; status:
  "outstanding" | "placed" | "conflict" }`. `pips` lets the panel draw domino dots; a future
  non-domino game omits it and the panel falls back to `label`. `key` is the stable id the
  panel echoes back to `selectReference`. Serialisable across Comlink.

- **D4 — The panel owns selection locally; status refreshes on move.** `<reference-panel>`
  is a `SignalWatcher` consuming `Puzzle` via context. It keeps `@state() model` and
  `@state() selectedKey`. It re-fetches `getReference()` when the reactive move counter
  changes or when it opens (found status is a function of board state). Clicking an item sets
  `selectedKey` (toggling to `null` if already selected) and calls
  `puzzle.selectReference(selectedKey)` — the highlight round-trips through the engine; the
  local `selectedKey` gives instant selection feedback without waiting on the async refetch.

- **D5 — Non-blocking responsive presentation, not a modal.** The toolbar button toggles the
  panel like a disclosure. Docked-beside-the-board when there is room — a wide viewport that
  is **not** the app's short-landscape "horizontal" orientation: the panel is docked to the
  side, the board reflows narrower and stays interactive. Bottom sheet otherwise — a narrow
  viewport **or** horizontal orientation: pinned to the lower edge, board visible and centred
  above it, close button to dismiss. Deliberately **no scrim** in either mode. Space is
  reserved by `padding-inline-end` (dock) or `padding-block-end` (sheet) on `main`, so the
  ResizeController-driven canvas reflows and re-centres. **Horizontal orientation must use the
  sheet, not the dock:** there `main` is a flex *row* with the toolbar as a right-hand column,
  so `padding-inline-end` squeezes the board off-centre into a dead gap between it and the
  panel (owner-caught in review); the bottom sheet keeps the board horizontally centred. The
  panel's `:host` media query and the `main` padding rule share the same condition
  (`(orientation: landscape) and (max-height: 40rem)`, mirroring `--app-orientation` in
  `common.css`). App-shell-local (CSS only), touching `puzzle-screen.ts` + `reference-panel.ts`.

- **D6 — Dominosa highlight: a new `Ui` field, new render flag, dedicated colour.**
  `DominosaUi.highlightPair: number | null` (a domino index `0…DCOUNT-1`, or null).
  `render.ts` gains `COL_REFERENCE` (appended past the existing palette, so dark-mode
  overrides don't touch it) and a per-tile `DF_REF` bit folded into the packed `Int32Array`
  cache key; for the selected `di`, every adjacent cell-pair `(i,j)` with
  `DINDEX(numbers[i], numbers[j]) === di` gets both cells boxed. `highlightPair` is reset to
  `null` alongside `highlight1/2` on completion; it persists across ordinary moves (placing a
  domino simply flips that pair's checklist status). It coexists with the number-highlight
  (independent visual channels).

- **D7 — Status from the grid, no solver.** `reference()` scans `grid`: for each `i` with
  `grid[i] > i`, `DINDEX(numbers[i], numbers[grid[i]])` is placed; count per index →
  `outstanding` (0), `placed` (1), `conflict` (≥2). No solve, no solution leak — pure
  accounting of what the player has laid down.

## Risks / Trade-offs

- **Responsive non-blocking panel is real layout work.** Mitigation: keep it CSS-driven with
  one breakpoint; board-interactive is the invariant to protect in a tier-3/Playwright check.
- **Async model fetch vs. instant selection feedback.** Mitigation: D4 — local `selectedKey`
  drives selection styling immediately; the round-trip only updates the board highlight.
- **"Too easy" concern.** The checklist leaks nothing (own placements only); the highlight
  shows *candidates*, not the answer, and sits behind an explicit button beside Hint/Solve —
  consistent with the fork's deliberate-aid stance.

## Migration Plan

Additive only. New optional `Game` hooks (existing games unaffected — `reference` absent →
`hasReference:false` → no button). New engine-surface methods default to null/no-op for
WASM. Ship registered/dev-verified; commit + archive on owner acceptance (parity-gate
convention). No data-format or save changes.

- **D8 — The spotlight persists past panel close; a board tap is the primary clear
  (owner-refined in review).** Closing the panel does **not** clear the board spotlight: on a
  small screen the panel is large, so the common flow is mark a piece → close the panel to see
  the board → place it. The **primary dismiss is a board tap** — Dominosa's `interpretMove`
  clears `highlightPair` on any in-grid pointer tap (still performing the tap's action, and
  repainting even when the tap resolves to no move), because Escape is undiscoverable and absent
  on touch. **Escape** (panel-open via `clearSelection`, panel-closed via `selectReference(null)`)
  and re-clicking the chip remain secondary clears. *Alternatives rejected:* clear-on-close (my
  first cut, hostile to the mobile flow); clearing only on a state-changing move via the midend
  (misses "any tap" — a tap on a diagonal or a number wouldn't clear, and the owner asked for
  *any* board click). *Alternative
  rejected:* clear-on-close (my first cut) — convenient on desktop but hostile to the mobile
  mark→close→place flow the owner called out.

## Open Questions

- Should a `conflict` (pair placed twice) item be independently clickable to highlight both
  offending placements? Defer: `findMistakes` already reds clashes; the checklist flagging
  the count is enough for v1.
