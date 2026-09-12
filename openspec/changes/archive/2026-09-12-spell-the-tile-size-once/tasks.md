# Spell the tile size once

## 1. Confirm the census before editing anything

- [x] 1.1 Re-take it. The numbers in `proposal.md` were measured 2026-09-12 off
      `src/__snapshots__/capability-surface.test.ts.snap`, and a count in prose
      is a census nobody re-runs. The snapshot is the query: `drawState`
      containing `tilesize` against `tileSize`. Assert no game holds both, so
      the three buckets are known to partition the 57.

      *Re-taken 2026-09-12 by parsing every snapshot entry (57 read): 40
      `tilesize`, 15 `tileSize`, 2 neither, 0 both — the proposal's table
      exactly. After the sweep: 55 `tileSize`, 0 `tilesize`.*
- [x] 1.2 Check what else spells it. `setTileSize`'s body, `computeSize`, every
      `redraw`, the tier-2.5 harness and each game's own tests all name the
      field; `grep` for the shape (`\.tilesize\b`), not for a declaration, and
      **not for the constant's name** — a copy is never called by the name of
      the thing it copies (`AGENTS.md` § "A scan that keys on a name").

      *Swept every identifier holding the word, not only the field: 114 `src`
      files. Beyond the 40 games' draw states that is `BorderGridDrawState`
      (Palisade and Separate's shared one), `hint-ordinal.ts`'s parameter,
      Ascent's and Guess's locals and parameters (both `tileSize` games with a
      `tilesize` local), two test probes, and the constants spelling it
      without its word break — Untangle's `PREFERRED_TILESIZE`, Spokes'
      `MIN_CORNER_TILESIZE` and the fourteen grid tilings' `*_TILESIZE`, now
      `*_TILE_SIZE` like the shared `PREFERRED_TILE_SIZE`. The only files
      holding both spellings were checked for a rename that could shadow: none
      had both in one scope. Kept verbatim: three comments quoting an upstream
      C expression, and the bare `TILESIZE`/`TILE_SIZE` in comments naming
      upstream's macros. The `ts-engine` spec's and `mechanics.md`'s
      "fifty-seven games had a `ds?.tilesize ??` fallback" are measurements of
      code as it then was, and keep the spelling it had.*

## 2. The rename

- [x] 2.1 40 games' `tilesize` → `tileSize`, one commit per batch small enough
      to read. Nothing about this is per-game, so batch by whatever keeps a
      diff reviewable rather than by family.

      *One commit. What makes it readable is 2.3, not its size: every one of
      its 468 changed `src` line pairs is the substitution, mechanically
      checked, so a reviewer reads the one exception rather than the diff.
      Splitting would have bought a gate run per batch and no extra review.*
- [x] 2.2 Decide Cube's `gridscale` (and whether Guess's `pegsz`/`gapsz`/
      `pegrad` want anything) in the same pass, so no third spelling is left
      behind. Both are genuine per-game answers about an untiled board — the
      question is only their casing.

      *Cube's is `gridScale`: a two-word name, cased like the rest. Guess's
      stay. They are not the tile size under another spelling and have no
      second spelling anywhere to converge with; expanding abbreviations is
      tidiness, which is not a reason.*
- [x] 2.3 **Verify by shape, not by a green suite.** Every changed line in the
      whole diff is the one intended substitution; read the exceptions. This is
      what catches a sweep that also rewrote prose in a doc comment, or
      swallowed a `describe` — the suite is green either way, with fewer tests
      in it.

      **The capability snapshot is the instrument for the half a text diff is
      worst at**, and it only became one on 2026-09-12
      (`widen-the-capability-snapshot`): it now records every game's
      draw-state field names, so this sweep's effect on the collection's
      *vocabulary* is a single reviewable diff. Expect exactly **one line pair
      per renamed game and nothing else** — a game missing from it is a game
      the sweep skipped, and any other moved line is a field that was not meant
      to change. That catches an omission, which scanning a diff of
      substitutions cannot: a line that was never edited leaves no trace in it.

      *`src` diff: 468 line pairs, every hunk balanced, one exception — the
      hand-edited `enrollment.ts` comment whose "55 of 57" count the rename
      falsified. Capability snapshot, compared per game as parsed field sets
      rather than as text (a renamed key re-sorts, since `tileSize` precedes
      `tiles`): 57 games before and after, exactly 41 entries moved — the 40
      games and Cube — each by its one renamed field, 0 exceptions.*
- [x] 2.4 **No recorded draw call moves.** A tile size is read by every
      `redraw`, so the tier-2.5 snapshots are the check; a rename that
      re-baselines one is not a rename. If one moves, stop and find out why.

      *All 320 test files passed with `-u` in effect and vitest reported one
      snapshot updated; `git status` confirms the capability snapshot is the
      only `.snap` that changed.*

## 3. Loopy's missing `started`

- [x] 3.1 Read it before assuming. Loopy is one of two games without the
      redraw doctrine's `started` flag, and Cube's absence is explained by its
      board while Loopy's is not. Either it is deliberate and says so, or it is
      a defect this change found and hands off — do not "fix" it inside a
      rename commit either way.

      *Deliberate, and says so: Loopy's `redraw` repaints the whole canvas
      every frame ("Every frame is a full repaint, so this both establishes the
      background on the first draw and erases the previous frame on every later
      one", `loopy/render.ts`). A game with no tile cache has no first-draw
      state to remember. Nothing to hand off.*

## 4. Close

- [x] 4.1 Full gate.
- [x] 4.2 Decide whether the convention is stated anywhere, and where. A line in
      `docs/games/rendering.md` makes it followable; a `ts-engine` requirement
      makes it normative; a guard enumerating approved draw-state field names is
      the manifest this collection refuses, and the capability snapshot's diff
      already covers this half.

      *A paragraph in `docs/games/rendering.md` beside `setTileSize`, and
      nothing else. A requirement naming a field would have no consumer but a
      guard, and that guard is the manifest; the snapshot is where a third
      spelling would surface.*
- [x] 4.3 Archive.
