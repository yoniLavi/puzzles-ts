# Tasks — bound-abcd-generable-sizes

## 1. Measure

- [x] 1.1 Sweep acceptance rate over `(w, h, n)` — at least `n` 3–7 against areas
      25–144 — with enough attempts per point to separate "rare" from "never".
      **Sweep shapes, not just areas**: the Clusters precedent found a predicate
      that area could not express at all (a 1xN strip, at any length).
      → **139 configurations in four passes**, `n` 3–9, both `diag` modes, areas
      16–400, aspect ratios 1:1 to 1:25. Recorded in `design.md` D1. The harness
      was validated against the real `newAbcdDesc` (byte-identical desc from the
      same seed) before any number was believed. Area could indeed not express
      it — **nor could clue density**, which is why pass 4 exists (D2).
- [x] 1.2 Decide the cutoff: the rate below which a board is refused, expressed
      as a wait a player would actually accept at ~0.065 ms per attempt.
      → **~2.5 s expected**, i.e. roughly 1 acceptance in 30,000. Chosen against
      the *tail*, not the mean: generation is geometric, so p99 ≈ 4.6× the mean
      and a 5 s bound would freeze the worker for ~23 s once in a hundred.

## 2. Implement

- [x] 2.1 Add the predicate to `validateParams`, gated on the generation arm only
      (an existing description must stay loadable).
      → `MAX_GENERABLE_AREA` per `(letters, diag)` for boards whose shorter side
      is ≥ 6, plus a flat 160-square cap for thinner ones. **Gating on `full`
      required fixing the engine first — the flag was dead** (D4).
- [x] 2.2 Lower `ABCD_MAX_ATTEMPTS` to match what the predicate admits.
      → 5,000,000 → 250,000, ~8× the slowest admitted configuration's need.
- [x] 2.3 Message names the limit and why, in the Custom dialog's voice.
      → Names the letter count as the cause and the area limit as the number,
      and suggests using fewer letters; thin boards get their own wording.

## 3. Verify

- [x] 3.1 Test: every shipped preset passes validation.
- [x] 3.2 Test: a configuration known un-generable (10×10 n4) is refused, and
      refused *fast* (asserted under 100 ms, without running the generator).
- [x] 3.3 Test: a `params:desc` id for a board outside the bound still loads.
- [x] 3.4 Differential unchanged; full gate green.
- [x] 3.5 *(added)* Test the bound in **both** directions — nine measured-generable
      configurations are admitted, not merely ten hopeless ones refused. A bound
      checked only for what it rejects is half-checked.
- [x] 3.6 *(added)* `midend.test.ts` covers the `full` flag's two arms, watched
      failing before the fix landed.

## 4. Close out

- [x] 4.1 Spec delta into `abcd`, plus an ADDED requirement in `ts-engine` for
      the `validateParams(full)` contract the fix restores.
- [x] 4.2 Note the limit in `help/games/abcd.md` (as Crossing and Seismic do),
      including why diagonal mode raises it rather than lowering it.
- [x] 4.3 Decide the 1xN Clusters residual named in `proposal.md`.
      → **Left standing**, with the reasoning recorded in `design.md` D5: a 1xN
      Clusters board generates and plays, so refusing it is a taste judgement,
      not the correctness-adjacent fact ABCD's bound rests on. One data point is
      not a rule.

## 5. Owner acceptance

- [x] 5.1 Owner acceptance on the size limits and the refusal wording, then
      archive. **Accepted 2026-08-21.** The visible change: the Custom dialog
      now refuses large boards immediately instead of freezing, and the limit
      depends on the letter count and on diagonal mode.

## 6. Found while verifying (fixed in `0d097c2`, not part of this change's spec)

- [x] 6.1 An owner bug report during acceptance — ABCD threw on load — surfaced
      a defect older and wider than this change: `Midend.applyMove` pushed
      `executeMove`'s return into `history` unchecked, so a save containing a
      move this build cannot play poisoned the history and made **every later
      repaint** throw. Fixed in `commitMove` + `loadGame` + the autosave restore
      path, with `save-round-trip.test.ts` sweeping all 57 games (37 go red
      without the fix). The gap that let it ship: there was no cross-game
      save/load coverage at all.
