## 1. The import cost

- [x] 1.1 The two-arm harness, on Range's real generator. Both arms live in one
      vitest process so they can be timed **interleaved**, which is what lets a
      ratio survive a machine that is not idle: `solver.ts` as it ships (tables
      local), a byte-identical copy importing them from a sibling, and — the arm
      the design asks for — an A/A control that is a second byte-identical copy
      keeping its tables local. Without that third arm a 1.7× could be an
      artifact of "the second module loaded is slower" and nothing in a two-arm
      run could tell the difference.
- [x] 1.2 **Measured under vitest: imported / local = 1.62, 1.69, 1.71, 1.73
      across four runs; A/A control 0.98–1.01.** 21 reps each, arm order rotated
      per rep, medians and minima agreeing (the minima are the least contended
      samples on a loaded box, so their agreement is the check that this is not
      contention).

      **The mechanism was confirmed structurally first, which is cheaper than
      timing and not subject to noise**: vite's module-runner transform rewrites
      `DR[i & 3]` to `__vite_ssr_import_0__.DR[i & 3]`, and its
      `__vite_ssr_exportName__` defines every export as a **getter** — so a table
      read in a hot loop pays an accessor call per access.
- [x] 1.3 **It does not survive bundling.** A two-module fixture built with
      `vite build --minify=false`: rolldown flattens both into one scope and the
      loop compiles to a direct `var` read, byte-identical to the local form.
- [x] 1.4 Recorded in `docs/games/testing.md` § "Timing anything under vitest",
      because the cost is a property of the test environment. The comment on
      `range/solver.ts` that asserted the unverified 1.5× now carries the
      re-measured range, its control, and the fact that it buys a player
      nothing — so the next reader does not mistake it for a rule against shared
      constants.

## 2. The A/A control

- [x] 2.1 Three arms, on the same real workload: one instance timed twice in a
      row; separately loaded instances timed once each; one instance after being
      driven at three other param shapes, which is what makes its inline caches
      polymorphic.
- [x] 2.2 **The claim is not reproduced.** One instance timed twice gives
      0.98–1.02 across runs, indistinguishable from the two-instance control's
      0.98–1.01. The fuzz-polluted instance gives 0.94–1.05, not the reported
      ~40% slowdown.

      **What separates a tight control from a loose one is warm-up, not instance
      count.** This harness exercises every arm once before the clock starts, and
      the distinction the claim describes disappears. The likeliest reading of
      the original reports is that their controls measured a cold first arm
      against a warm second — a warm-up defect wearing an instance-identity
      explanation.
- [x] 2.3 `docs/test-strength.md` § 7 gains the two rows, including the one for
      this change's own first instrument: a micro-benchmark that stubbed the
      namespace as plain data properties measured the imported arm as *faster*,
      contradicting a mechanism that had already been confirmed by reading the
      transform's output. The stub was the thing being measured.

      **No past conclusion needs revisiting.** The claim was that a share of this
      repository's timing verdicts rested on a control that was too generous; the
      control is not too generous, so they do not.

## 3. Close

- [x] 3.1 Claim 1 true and larger than reported, but confined to the suite.
      Claim 2 false, with the likely cause of the original reading recorded so it
      is not re-investigated.
- [x] 3.2 Run the full gate.
- [x] 3.3 Archive the change.
