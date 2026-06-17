# Design — Untangle TS port

Distilled from a deep read of `puzzles/untangle.c` (2073 lines). Line numbers refer
to `untangle.c`. Read `src/native/games/galaxies/` as the exemplar; this design is
the map so the implementer needn't re-derive it.

## D1 — supersede_desc is NOT needed (the de-risking finding)

`midend_supersede_game_desc` is called **only by `mines.c:2168`** — never by
Untangle (grep-verified across `puzzles/`). Untangle's public desc is **edges
only** (`encode_graph` with `params=NULL`, lines 555-615) and never changes. Vertex
positions are reconstructed two ways, neither the desc:
1. the initial circle layout is recomputed deterministically by `new_game` →
   `make_circle` (524-552, 895-905) from `n` alone;
2. the player's drags survive through the **serialised move list** (each drag is a
   `P%d:x,y/d` move; `midend_serialise` writes them all; replay reproduces the
   layout).

This maps onto our existing save format (`midend.ts` `desc` + `moves` + `pos`) with
zero new engine code. **Do not add supersede_desc in this change.** Document why in
the port; correct the AGENTS.md long-tail note (Untangle is move-log-handled; Mines
remains the forcing function for supersede_desc).

## D2 — Data model

- **Params** (97-99): `{ n: number }` only. Default 10; presets 6/10/15/20/25
  (150-157). `validateParams`: `n ≥ 4`, plus a sane upper cap (the generator
  allocates a `COORDLIMIT(n)²` scratch; a few-thousand cap is fine).
- **Rational point** (79-85): `{ x, y, d }` meaning `x/d, y/d`. Fractions are
  load-bearing: (a) exact integer crossing tests (no float epsilon), (b) three
  coexisting coordinate systems — circle layout `d=64`
  (`PREFERRED_TILESIZE`), dragged `d=tilesize`, snapped `d=(n-1)*2`. `d` is
  **per-point** — `cross()` keeps each point's own `d` in the cross-multiplication;
  points in one state can have different denominators.
- **Topology vs positions fully separated** — the architectural key:
  - `edges` (the `a<b` pairs) are **immutable for the game's life**, shared by
    every state (C refcounts; we freeze + share by reference, like Galaxies'
    topology / Flip's frozen matrix). Build once in `newState`.
  - `pts` (positions) are the only thing `executeMove` changes.
  - `crosses[]` (per-edge bool) + `completed` are **derived** — recomputed each
    transition by `findCrossings`.

## D3 — Generator (`new_game_desc`, 617-829)

Two phases:
- **Phase A — planar graph** (630-748): scatter `n` points on a shuffled
  `w=h=squarert(n·3)` grid (`COORDLIMIT`/`POINTDENSITY`, 451-453); greedily add
  edges lowest-degree-vertex-first (vertices in a degree-keyed order), nearest
  candidate first, accepting an edge iff it crosses no existing point AND no
  existing edge, capping degree at `MAXDEGREE=4`. Planar by construction. Ends when
  a full pass adds nothing. (Edge count is NOT a param — it falls out of the fill.)
- **Phase B — tangle** (750-776): `make_circle` places points evenly on a circle
  (`d=64`); shuffle a vertex→slot permutation and **re-roll until ≥1 non-adjacent
  edge pair crosses** (never start solved).
- **Desc** (555-615): `min-max,...` zero-based sorted edge pairs, edges only,
  re-sorted after applying the circle permutation (no generation-order side
  channel). `validateDesc`: each `a-b` with `0 ≤ a,b < n`, `a ≠ b`.
- **`aux`** (786-813): the solved (scattered) layout `S;P0:x,y/d;...` through the
  same permutation, scaled to even denominators + half-cell offset. Optional in our
  `newDesc` return; NOT persisted — so Solve works only on a freshly generated game
  (faithful to upstream).

Idiomatic note: the degree-ordered vertex iteration is a *transient generator*
structure — a re-sorted array or tiny indexed-min, NOT game state. No
`SortedMultiset`.

## D4 — Crossing test (`cross`, 338-424) + solved status

Segment intersection by two-sided orientation, done exactly in integers (the C uses
`int64`/`dotprod64` ONLY to avoid overflow when multiplying coords by denominators).
Handles the collinear-overlap case and treats an endpoint lying on the other
segment as a crossing. **TS:** port faithfully; use `BigInt` for the dot-product
accumulator inside `cross()` only (`cross` runs O(E²) per move, E ≲ 2n — not hot),
`number` elsewhere. `findCrossings(pts, edges)` → `{ crosses: boolean[]; completed }`
checks every **non-adjacent** edge pair (adjacent edges share a vertex, don't
count); called in `newState` + `executeMove`; `status()` returns `"solved"` iff
`completed`.

## D5 — Move model

- `interpretMove` (playable paths only, 1349-1610):
  - mouse-down: nearest vertex within `DRAG_THRESHOLD=12`px → start drag, return
    `UI_UPDATE`; else nothing.
  - drag: update live `newpoint`, `UI_UPDATE`.
  - release: emit `{kind:"place", points:[{i,x,y,d}], solving:false}`. **Divergence
    (owner-requested 2026-06-17):** the drag target is **clamped** to keep the vertex
    blob inside the play-area border (`PLAY_MARGIN`), so dragging past the edge pins
    the vertex at the nearest in-bounds spot and a drop **commits there** — upstream's
    drag-right-off-the-window-to-cancel affordance is dropped. (This also subsumes the
    integer-rounding boundary: pixel input is clamped+rounded in `placeDraggedPoint`.)
  - `place_dragged_point` (1254-1308): no-snap → `d=tilesize`; snap → half-grid
    `d=(n-1)*2`.
  - keyboard: quadrant nearest-point select (1429-1510, exact rational quadrant
    test 1479-1492), `CURSOR_SELECT` to begin/end drag, arrows nudge a held point by
    `tilesize/2`, `SELECT2`/Tab cycle (Shift reverses). `ui.dragpoint` vs
    `ui.cursorpoint`: at most one valid.
- `executeMove` (1612-1692): apply each `{i,x,y,d}` (validate `d>0`, `0≤i<n`),
  recompute crossings. Leading solve marker sets `usedSolve`. Throw on malformed
  (interface contract).
- **`Move`** = `{ kind: "place"; points: {i,x,y,d}[]; solving: boolean }` — one
  entry for a drag, all `n` for a solve. Structured-clone-safe → default
  serialise/deserialise, no custom codec.
- **Solve** (`solve_game`, 990-1134): needs `aux` (refuse "Solution not known" if
  absent — only fresh games). Decode aux, try all **8 dihedral symmetries**, pick
  the one closest (least summed squared distance) to current positions (shortest
  solve animation respecting partial untangling), emit an all-vertex `solving:true`
  move with `d=2`.

## D6 — Render (`game_redraw`, 1799-1958)

Full repaint each frame, BUT with an early-out: recompute pixel positions into
`ds.x[]/ds.y[]`, return without drawing if bg + dragpoint + cursorpoint + all
positions are unchanged (1877-1884) — that's the whole cache strategy (no per-tile
cache). Frame: bg (or alternating flash during solve); edges as lines
(`COL_CROSSEDLINE` red when `crosses[e]` and the crossed-highlight pref is on, else
black); vertices in fixed z-order (point/neighbour/cursor/drag — drag on top),
coloured drag→white, cursor→grey, neighbour-of-drag→red, else blue; `CIRCLE_RADIUS=6`
filled circle + black outline (or the vertex index as text if the numbers pref is
on). During a move, interpolate each point `mix(old,new,t)`; draw the in-flight drag
at `ui.newpoint` live. `animLength`: `ANIM_TIME=0.13` (`SOLVEANIM_TIME=0.5` for
solve, `0` for a just-committed drag). `flashLength`: `FLASH_TIME=0.30` on a fresh
non-cheated completion. **TS:** `DrawState` holds `tilesize`, last bg/drag/cursor,
`x[]/y[]`; recompute → early-out → full repaint. Drive drag live-follow from `ui`
(passed to `redraw`). Verify with tier-2.5 `renderScenario` (assert edge/point/
crossed-red/drag-highlight ops + snapshot a tangled frame and a mid-drag frame).

## D7 — Long-tail risks (all benign for Untangle)

- supersede_desc — not needed (D1).
- undo-via-state-string-equality — not used; a no-op drag returns `UI_UPDATE`, a
  real drag a `Move`. Fits our model cleanly.
- `#ifdef EDITOR` — excluded entirely; don't map `E` moves, no text format.
- `me` back-reference — not used (only Mines).
- prefs (`snap_to_grid`/`show_crossed_edges`/`vertex_numbers`) — **owner chose to
  build the real engine prefs hook** (see D10), not fixed defaults. Untangle is the
  forcing function. Defaults still set in `newUi` (crossed-highlight ON, others
  OFF); all three togglable in the existing prefs form.
- no `hint`/`findMistakes` — crossings are the mistakes (red edges); no deductive
  narration exists.

## D8 — Test plan (three tiers)

- Tier 1: generator emits planar graphs, all degree ≤4, ≥1 starting crossing;
  `cross()` against hand-built cases (crossing / collinear-overlap /
  endpoint-on-segment / parallel-disjoint); `findCrossings`/`completed`; drag
  `executeMove` round-trip; 8-symmetry solve lands crossing-free; **save→moves→load
  reproduces `pts` exactly** (the move-log-replaces-supersede guarantee — assert a
  dragged board survives a serialise round-trip).
- Tier 2.5: `renderScenario` op-assertions + snapshot (tangled frame, mid-drag
  frame).
- Differential: gated frozen `untangle-differential.test.ts` via
  `describeDescDifferential` (desc byte-match for a seed) + planar+solvable check;
  transient `untangle-trace.c` deleted with `untangle.c` at acceptance.

## D10 — Engine preferences hook (owner-chosen, 2026-06-17)

The owner chose to build a real per-game prefs hook rather than ship fixed
defaults. Untangle is the forcing function (Mines is for `supersede_desc`).

- **`Game` interface** — an optional declarative `prefs?: GamePref<Ui>[]`. Each
  item is a discriminated union:
  - `{ kw, name, type: "boolean", get(ui): boolean, set(ui, v): void }`
  - `{ kw, name, type: "choices", choices: string[], get(ui): number, set(ui, v): void }`

  The value lives on the `Ui` (upstream stores prefs on `game_ui`, and Untangle's
  `redraw`/`place_dragged_point` read them off the ui). Declarative get/set
  closures over `Ui` keep it type-safe with no separate hand-written get/set
  methods. Boolean ↔ boolean; choices ↔ zero-based numeric index (matches the
  app form: `wa-option value=${index}`, handler does `Number.parseInt`).

- **`Midend` / `EngineCore`** — `getPreferencesConfig()` builds the
  `ConfigDescription` (`{title:id, items:{[kw]:{type,name,choicenames?}}}`);
  `getPreferences()` reads `{[kw]: get(ui)}`; `setPreferences(values)` applies only
  present keys, coercing per item type, then `requestRedraw()`. **Retention**: the
  midend recreates `ui` via `newUi` on every `startFrom` (new game / load /
  from-id), so it keeps a `prefValues: ConfigValues`, merges into it on
  `setPreferences`, and re-applies via `applyPrefs()` after each `newUi` —
  reproducing upstream's single-`game_ui`-across-new-games behaviour. Guarded so a
  `setPreferences` before any game starts just stores (applied when the game
  starts). Prefs are **not** in the save file (app persists them per-puzzle in
  IndexedDB already; `puzzle-screen` loads them and calls `setPreferences` on
  puzzle-loaded).

- **`TsWorkerPuzzle`** — replace the three `getPreferencesConfig`/`getPreferences`/
  `setPreferences` stubs with engine delegations. Binary `savePreferences`/
  `loadPreferences` stay no-ops (the app never calls them for persistence —
  grep-verified; only `get`/`setPreferences` + `ConfigValues` are on the path).

- **No app-shell change**: `puzzle-preferences-form` (`puzzle-config.ts`) and
  `settings.{get,set}PuzzlePreferences` already consume the surface
  engine-agnostically. Empty `prefs` ⇒ empty config (current ports unaffected).

## D9 — Genuinely fiddly parts (where to spend care)

1. The exact integer `cross()` (use `BigInt` accumulator; test exhaustively incl.
   collinear/endpoint cases).
2. Keyboard quadrant navigation (faithfully port the rational quadrant test,
   1479-1492).
3. **The `RationalPoint` integer invariant.** `cross()`'s `BigInt` accumulator
   throws on a fraction, but our pointer pipeline can deliver sub-pixel
   coordinates (devicePixelRatio scaling) where upstream's GUI frontend hands
   `interpret_move` integer pixels. Two-layer defence (found in owner dev-verify,
   a `RangeError` on the first in-window fractional drop): round pixel input to
   integers at the boundary (`placeDraggedPoint`), and re-check integrality of
   every applied point in `executeMove` — the single chokepoint for drag/solve/
   replay/load — so any future bypass fails loudly and locally instead of as a
   cryptic deep `BigInt` error. Covered by a 250-iteration fuzz test (snap on/off,
   odd tile size) plus a contract-guard test.
Everything else is mechanical given this map.
