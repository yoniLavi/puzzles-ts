# Tasks — add-sticks-difficulty-tiers

## 0. Spike: is there a second rung? (gating)

- [ ] 0.1 Survey Tatebo-Yokobo technique names beyond "tentative placement
      contradicts".
- [ ] 0.2 Implement the most promising as a candidate rung; measure what fraction
      of boards it decides that the current technique cannot.
- [ ] 0.3 Decide: real and narratable ⇒ continue; otherwise stop and record.
      A tier the generator can rarely fill is worse than no tier.

## 1. Tiers

- [ ] 1.0 **Read the generator's retry loop before touching the gate.** If it
      carries state between attempts, a rejection that can now land on a
      *completed* candidate must perturb rather than discard — a plain refusal is
      a hang, and a full reset is 5–7x the cost. See the Clusters section in
      `proposal.md`.
- [ ] 1.1 Difficulty parameter: encode/decode, a default for an ID carrying none
      — argued, not assumed: "the tier that reproduces today's boards" may not
      exist — plus `validateParams`, `paramConfig`.
- [ ] 1.2 Gate honestly: solvable at the tier, not at the tier below. Run the rung
      below first where the two nest — it is free, and skips the expensive rung on
      every candidate the cheap one settles.
- [ ] 1.3 Presets per tier; measure generation cost by the tail, and measure any
      parameter floor rather than reasoning one out — the Clusters guess was more
      than twice the measured value, and its obvious predicate was the wrong one.

## 2. Assurance

- [ ] 2.1 **First try to keep the byte-match**, by holding the new rung behind an
      `upstreamLooseGate`-style flag set by the differential alone (the Spokes
      shape; Clusters kept its oracle in full this way). Only if that genuinely
      cannot express the old verdict: retire it, replace with
      uniquely-solvable-at-exactly-its-tier, and **record what was lost**.
- [ ] 2.2 Keep the two ported `x > 1` / `y > 1` reachability quirks or replace
      them deliberately — they are reachability *bugs*, and a new rung may make
      them visible.

## 3. Close out

- [ ] 3.1 Spec delta `sticks`; update `help/games/sticks.md`.
- [ ] 3.2 Full gate green; owner acceptance on the tiers.
