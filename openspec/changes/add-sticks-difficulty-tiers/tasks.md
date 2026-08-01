# Tasks — add-sticks-difficulty-tiers

## 0. Spike: is there a second rung? (gating)

- [ ] 0.1 Survey Tatebo-Yokobo technique names beyond "tentative placement
      contradicts".
- [ ] 0.2 Implement the most promising as a candidate rung; measure what fraction
      of boards it decides that the current technique cannot.
- [ ] 0.3 Decide: real and narratable ⇒ continue; otherwise stop and record.
      A tier the generator can rarely fill is worse than no tier.

## 1. Tiers

- [ ] 1.1 Difficulty parameter: encode/decode, default reproducing today's boards
      for an ID carrying none, `validateParams`, `paramConfig`.
- [ ] 1.2 Gate honestly: solvable at the tier, not at the tier below.
- [ ] 1.3 Presets per tier; measure generation cost by the tail.

## 2. Assurance

- [ ] 2.1 Retire the desc byte-match; replace with
      uniquely-solvable-at-exactly-its-tier.
- [ ] 2.2 Keep the two ported `x > 1` / `y > 1` reachability quirks or replace
      them deliberately — they are reachability *bugs*, and a new rung may make
      them visible.

## 3. Close out

- [ ] 3.1 Spec delta `sticks`; update `help/games/sticks.md`.
- [ ] 3.2 Full gate green; owner acceptance on the tiers.
