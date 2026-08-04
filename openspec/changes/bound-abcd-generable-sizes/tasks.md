# Tasks — bound-abcd-generable-sizes

## 1. Measure

- [ ] 1.1 Sweep acceptance rate over `(w, h, n)` — at least `n` 3–7 against areas
      25–144 — with enough attempts per point to separate "rare" from "never".
      **Sweep shapes, not just areas**: the Clusters precedent found a predicate
      that area could not express at all (a 1xN strip, at any length).
- [ ] 1.2 Decide the cutoff: the rate below which a board is refused, expressed
      as a wait a player would actually accept at ~0.065 ms per attempt.

## 2. Implement

- [ ] 2.1 Add the predicate to `validateParams`, gated on the generation arm only
      (an existing description must stay loadable).
- [ ] 2.2 Lower `ABCD_MAX_ATTEMPTS` to match what the predicate admits.
- [ ] 2.3 Message names the limit and why, in the Custom dialog's voice.

## 3. Verify

- [ ] 3.1 Test: every shipped preset passes validation.
- [ ] 3.2 Test: a configuration known un-generable (10×10 n4) is refused, and
      refused *fast*.
- [ ] 3.3 Test: a `params:desc` id for a board outside the bound still loads.
- [ ] 3.4 Differential unchanged; full gate green.

## 4. Close out

- [ ] 4.1 Spec delta into `abcd`.
- [ ] 4.2 Note the limit in `help/games/abcd.md` (as Crossing and Seismic do).
- [ ] 4.3 Decide the 1xN Clusters residual named in `proposal.md`: either this
      change establishes a rule for "generates, but should not be offered" and
      Clusters follows it, or the note is left standing and says so.
