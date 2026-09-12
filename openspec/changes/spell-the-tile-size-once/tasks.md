# Spell the tile size once

## 1. Confirm the census before editing anything

- [ ] 1.1 Re-take it. The numbers in `proposal.md` were measured 2026-09-12 off
      `src/__snapshots__/capability-surface.test.ts.snap`, and a count in prose
      is a census nobody re-runs. The snapshot is the query: `drawState`
      containing `tilesize` against `tileSize`. Assert no game holds both, so
      the three buckets are known to partition the 57.
- [ ] 1.2 Check what else spells it. `setTileSize`'s body, `computeSize`, every
      `redraw`, the tier-2.5 harness and each game's own tests all name the
      field; `grep` for the shape (`\.tilesize\b`), not for a declaration, and
      **not for the constant's name** — a copy is never called by the name of
      the thing it copies (`AGENTS.md` § "A scan that keys on a name").

## 2. The rename

- [ ] 2.1 40 games' `tilesize` → `tileSize`, one commit per batch small enough
      to read. Nothing about this is per-game, so batch by whatever keeps a
      diff reviewable rather than by family.
- [ ] 2.2 Decide Cube's `gridscale` (and whether Guess's `pegsz`/`gapsz`/
      `pegrad` want anything) in the same pass, so no third spelling is left
      behind. Both are genuine per-game answers about an untiled board — the
      question is only their casing.
- [ ] 2.3 **Verify by shape, not by a green suite.** Every changed line in the
      whole diff is the one intended substitution; read the exceptions. This is
      what catches a sweep that also rewrote prose in a doc comment, or
      swallowed a `describe` — the suite is green either way, with fewer tests
      in it.
- [ ] 2.4 **No recorded draw call moves.** A tile size is read by every
      `redraw`, so the tier-2.5 snapshots are the check; a rename that
      re-baselines one is not a rename. If one moves, stop and find out why.

## 3. Loopy's missing `started`

- [ ] 3.1 Read it before assuming. Loopy is one of two games without the
      redraw doctrine's `started` flag, and Cube's absence is explained by its
      board while Loopy's is not. Either it is deliberate and says so, or it is
      a defect this change found and hands off — do not "fix" it inside a
      rename commit either way.

## 4. Close

- [ ] 4.1 Full gate.
- [ ] 4.2 Decide whether the convention is stated anywhere, and where. A line in
      `docs/games/rendering.md` makes it followable; a `ts-engine` requirement
      makes it normative; a guard enumerating approved draw-state field names is
      the manifest this collection refuses, and the capability snapshot's diff
      already covers this half.
- [ ] 4.3 Archive.
