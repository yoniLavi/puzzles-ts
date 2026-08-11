# Tasks

## 1. Read the rungs before touching anything

- [ ] 1.1 `engine/latin.ts`: classify `forcing` (and any other trial-based
      rung) by the propagation test. Record *how many links* a typical forcing
      chain has on shipped boards — design D2 turns on the number, and the
      repo's standing rule is to check the instrument and the quantity before
      the argument.
- [ ] 1.2 The Latin games' own hard rungs (Towers, Keen, Unequal, Solo,
      Group), which ship `Extreme` *and* `Unreasonable`: what does each tier
      cap admit, and which rung is the difference between them?
- [ ] 1.3 The others the policy names: Spokes (Tricky/Hard contradiction
      look-ahead), Bricks and Boats (validator trials), Sticks (the exemplar of
      the exempt shape), Undead (Tricky forcing, measured and accepted at 130
      chars).
- [ ] 1.4 Write the classification down as a table in this change — rung,
      shape, tier it ships under, verdict — the way `audit-author-known-issues`
      kept its sweep. It is the artefact even if nothing needs fixing.

## 2. Decide, per game

- [ ] 2.1 For each mis-named tier, choose between renaming it, gating its
      generation to what the name promises, and restructuring the rung
      (design D3). Owner call where a player-visible name moves.
- [ ] 2.2 For any rung on the wrong side whose hint narrates its trial, drop
      the narration rather than reword it (design D4, the Galaxies precedent).
- [ ] 2.3 Record every *no-change* verdict with its reason. A tier that reads
      wrong and is right needs the argument written down, or the next reader
      re-opens it.

## 3. Make the rule checkable

- [ ] 3.1 Add the propagation test to the `ts-engine` hint-system requirement
      (the delta in this change), so the policy has a normative home rather
      than living in two guides.
- [ ] 3.2 Guard it (design's open question): either a declaration on the game
      or a per-game test in the shape of `galaxies-hint.test.ts`'s "the hint
      never guesses". **Prove the guard fails** before trusting it.

## 4. Close out

- [ ] 4.1 Apply whatever 2.x decided; per-game spec deltas for any tier that
      moves.
- [ ] 4.2 `openspec validate audit-guessing-tier-names --strict`; owner
      acceptance; archive.
