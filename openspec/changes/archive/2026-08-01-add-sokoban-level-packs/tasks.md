# Tasks — add-sokoban-level-packs

> **WITHDRAWN 2026-08-01 — nofix. No task below was started.** See the banner in
> `proposal.md` for the decision and for the reframing of the procedural
> alternative.

## 1. Source the levels (gating)

- [ ] 1.1 Identify a level set with a licence compatible with this fork's MIT
      layering; record the source and licence in the design. **No level is
      committed before this is settled.**
- [ ] 1.2 Convert to the port's description format; confirm each parses.

## 2. Selection surface

- [ ] 2.1 Decide how a fixed enumerated list is chosen from, given every other
      game's "size + seed" model — game-local list, or a general facility.
- [ ] 2.2 Preserve deep links and saved games across the new addressing.
- [ ] 2.3 Keep random generation reachable.

## 3. Verify

- [ ] 3.1 Every shipped level solvable by the ported solver; minimum push count
      recorded and asserted.
- [ ] 3.2 Tier-2.5 render scenario for a pack level.
- [ ] 3.3 Full gate green.

## 4. Close out

- [ ] 4.1 Spec delta into `sokoban`.
- [ ] 4.2 Attribution in `CREDITS.md` / `LICENSE.md`.
- [ ] 4.3 Update the Sokoban help page.
