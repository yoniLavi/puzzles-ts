# Change: Native TS port of Untangle (port #16)

## Why
Migration order item 7 (outward, simplest-first). Untangle — drag graph vertices
until no edges cross — is the next port. A deep read of `puzzles/untangle.c` (2073
lines) found it is a **comparatively low-risk port**: no deductive solver, editor
build cleanly excluded, and — the headline finding — **it does NOT use
`midend_supersede_game_desc`**. A grep across all of `puzzles/` confirms Mines is
the *only* caller. Untangle's public desc is edges-only and never changes; the
player's dragged positions are reconstructed from the **serialised move log**,
which our TS save format (`midend.ts` `moves:` + `pos`) already handles. So
Untangle needs **no new engine mechanism** — the supersede_desc work correctly
defers to whenever Mines (or Net's centre-on-click) is ported. CLAUDE.md's
long-tail-risk note lists Untangle under supersede_desc; this change corrects that
(Untangle's drag-to-rearrange-then-share is handled by the move log, not
supersede).

## What Changes
- **Port Untangle to native TS** in `src/native/games/untangle/` implementing
  `Game<UntangleParams, UntangleState, UntangleMove, UntangleUi, UntangleDrawState>`,
  registered via the runtime registry. File split (Galaxies exemplar):
  - `state.ts` — the rational `Point {x,y,d}` (value `x/d, y/d`), immutable
    `UntangleState` (shared frozen `edges` + `edgeSet`, per-move `pts`, derived
    `crosses`/`completed`), `cloneState` (copies only `pts`), `decodeGame` (parse
    the `a-b,...` edge desc), `findCrossings`, and the exact integer `cross()`
    segment-intersection primitive.
  - `generator.ts` — `newDesc`: Phase A scatter-shuffle + greedy non-crossing
    edge-add (degree-capped at 4, planar by construction), Phase B circle layout
    re-rolled until ≥1 crossing; emits the edges-only desc + the solved-layout
    `aux`.
  - `render.ts` — full-frame redraw with the "did anything visible move?" early-out
    (no per-tile cache), a **play-area border** framing the drop zone, edges (red
    when crossed), vertices in z-order (drag white / cursor grey / **neighbour light
    blue** — red stays reserved for crossings), drag live-follow, solve animation
    `mix`, win flash.
  - `index.ts` — params/presets/validate, `newState`/`newUi`/`changedState`,
    `interpretMove` (drag + keyboard quadrant nav + select-to-drag), `executeMove`,
    `status` (solved iff no crossings), `solve` (decode `aux`, pick the closest of 8
    dihedral symmetries), `colours`, `computeSize`, `animLength`/`flashLength`,
    `registerGame`.
- **Exact crossing test**: port `cross()` faithfully; use `BigInt` only for the
  dot-product accumulator (the C reaches for `int64` here solely to avoid overflow),
  `number` everywhere else.
- **Edge set idiomatically**: a frozen sorted `readonly Edge[]` + a `Set<number>`
  of packed `a*n+b` keys — no `tree234`/`SortedMultiset` (the C tree234 only does
  dedup + sorted iteration a `Set` + one `.sort()` cover).
- **Editor build excluded** (the `#ifdef EDITOR` half — `E`-move edge add/delete,
  `game_text_format`): not ported, not mapped, per the established "don't map
  editor-only letters" stance (Galaxies precedent). `canFormatAsText = false`.
- **No `hint`/`findMistakes`**: Untangle has no deductive solver to narrate, and
  crossings ARE the mistakes — the crossed-edge red colouring is the built-in
  mistake feedback, so a separate `findMistakes` hook is redundant.
- **A real per-game preferences hook** (engine-level, this change's headline
  scope addition): Untangle is the forcing function for runtime preferences the
  way Mines is for `supersede_desc`. Rather than ship fixed defaults with no UI,
  add an optional declarative `prefs` member to the `Game` interface (each item:
  `kw`/`name`/`type` + `get`/`set` over the game's `Ui`), implement
  `getPreferencesConfig`/`getPreferences`/`setPreferences` on the `Midend`, and
  delegate them from the `TsWorkerPuzzle` adapter (replacing its three stubs).
  The app's existing `puzzle-preferences-form` + per-puzzle IndexedDB persistence
  then drive a TS game's preferences with **no app-shell change**. The midend
  retains the last-applied values and re-applies them after each `newUi` (new
  game / load), reproducing upstream's single-`game_ui`-across-new-games effect.
  Untangle is the first consumer (snap-to-grid, show-crossed-edges, vertex-style);
  future ports with upstream prefs (Solo, Net, …) reuse the same hook.
- **Differential check**: a transient `puzzles/auxiliary/untangle-trace.c` →
  gated frozen `untangle-differential.test.ts` (desc byte-match for a seed proving
  `random.ts` end-to-end; every generated board planar + solvable), harness deleted
  with `untangle.c` at acceptance. Uses the `describeDescDifferential` helper from
  `improve-port-tooling`.
- **Correct the AGENTS.md long-tail note**: move Untangle out from under the
  supersede_desc risk (it's move-log-handled); Mines/Net remain the forcing
  functions.
- **Shared shell tweak (capability-based, not Untangle-specific)**: the hint banner
  in `src/puzzle/puzzle-view.ts` reserves a line so a hint-capable board doesn't jump
  when a hint appears; for a game that **cannot** hint that line is permanent dead
  space below the board. Gate the banner on `puzzle.canHint` (mirroring how the
  status bar is gated on `wantsStatusbar`), so every no-hint game — Untangle included
  — drops the dead strip. Verified a hint game (Sixteen) still reserves its banner.
- **Parity-gated**: register + dev-verify under `npm run dev`; flip `TS_PORTED` +
  delete `puzzles/untangle.c` + the trace harness ONLY on owner acceptance.

## Resolved design decision (owner, 2026-06-17)
Untangle has three upstream preferences (`snap_to_grid`, `show_crossed_edges`,
`vertex_numbers`). The owner chose to **build the real engine prefs hook** (above)
rather than ship fixed defaults — Untangle becomes the prefs forcing function.
Shipped defaults (set in `newUi`, since the divergence point is the default, not
the availability): **crossed-edge highlight ON** (doubles as mistake feedback),
snap OFF, vertex-style Circles. All three are user-togglable in the existing
puzzle preferences form.

## Impact
- **Affected specs:** new `untangle` capability spec (per-game), **plus a
  `ts-engine` delta** for the per-game preferences hook (the supersede_desc
  finding still holds — no supersede mechanism needed — but the owner-chosen
  prefs hook is a genuine engine addition).
- **Affected code:** new `src/native/games/untangle/` (5 modules + tests),
  the prefs hook in `src/native/engine/{game,midend,worker-adapter}.ts`,
  registration in `ts-ported-ids.ts` + `games/index.ts` (on acceptance), transient
  `puzzles/auxiliary/untangle-trace.c`, AGENTS.md long-tail-note correction. On
  acceptance: `TS_PORTED` in `puzzles/CMakeLists.txt`, `puzzles/untangle.c` +
  trace harness deleted, two icon PNGs.
- **Behaviour:** Untangle served by the TS engine once registered; identical
  gameplay to the C build (save/share via the move log), plus the deliberate
  divergences above.
- **Depends on:** `improve-port-tooling` (the `describeDescDifferential` helper and
  the enriched scaffolder) lands first.
