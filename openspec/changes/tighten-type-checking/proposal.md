# tighten-type-checking

## Why

**53 branches in this codebase can never run.** A type-aware lint sweep on
2026-08-01 found 38 conditions where "the types have no overlap" and 15 that are
"always falsy" — code written to handle a case the type system can prove does not
occur. Each is one of two things: a guard that was needed before a type was
tightened and is now noise, or **a check that was meant to fire and silently
never does**. The second kind is a bug, and nothing in the current gate can see
them, because Biome's inference is not type-aware and `tsc` does not consider an
always-false condition an error.

This is the honest version of a claim from the generic cleanup plan reviewed on
2026-08-01, which promised `no-unnecessary-condition` would delete "usually
hundreds of lines" of inherited null-pointer discipline. Measured here, all four
of its "demolition rules" together produce **258 findings** — not a large
deletion. But the LOC was never the point: 53 dead branches in solver and midend
code is a bug-hunting result, and the remaining 205 (`prefer-nullish-coalescing`
34, `prefer-optional-chain` 21, `no-unnecessary-type-assertion` 15, plus 83
always-truthy conditions) are ordinary tidying that comes free with the same run.

**Three compiler flags are also still off, and they are cheap.** `strict`,
`noUnusedLocals`, `noUnusedParameters` and `noFallthroughCasesInSwitch` are
already on. Of the rest, measured error counts are `exactOptionalPropertyTypes`
**108**, `noPropertyAccessFromIndexSignature` **52**, `noImplicitOverride` **27**
— 187 in total, and each one is a real distinction the code currently blurs.

**One flag is refused, and this change is where that is written down.**
`noUncheckedIndexedAccess` produces **9,028 errors**, concentrated in exactly the
solvers where index provenance is structurally obvious. `establish-refactor-baseline`
D5 has the full argument; this change records the decision at the tsconfig it
governs, because the flag will otherwise be re-proposed by every future reader of
a strictness checklist.

## What Changes

- **Enable `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`
  and `noImplicitOverride`**, fixing the ~187 resulting errors module by module,
  lowest fan-in first.
- **Run the type-aware lint rules once as an audit**, not as a permanent second
  toolchain: `no-unnecessary-condition`, `no-unnecessary-type-assertion`,
  `prefer-optional-chain`, `prefer-nullish-coalescing`.
- **Triage every dead branch as a suspected bug before deleting it.** The 38
  "no overlap" and 15 "always falsy" findings are the point of this change. A
  finding is resolved by *one of*: deleting a genuinely redundant guard, **or**
  fixing the condition that was meant to fire and doesn't — and the second
  outcome must be reported, not folded silently into a tidy-up diff.
- **Decide, on the evidence, whether the type-aware lint stays in CI.** Adopt it
  permanently only if the audit finds enough that recurrence is plausible;
  otherwise record the finding count and re-run it per refactoring round from
  the metrics harness. Either way the decision is recorded rather than defaulted.
- **Record the `noUncheckedIndexedAccess` refusal in `tsconfig.json`** as a
  comment naming the measurement, so the next reader gets the number rather than
  re-deriving it.

## Impact

- Affected specs: `build-pipeline` (whether type-aware lint joins the gate).
- Affected code: `tsconfig.json`, plus ~187 sites for the compiler flags and up
  to 258 for the lint findings, spread thinly across the tree — no single file
  has more than 8 lint findings.
- **Behaviour may change, deliberately, wherever a dead branch turns out to be a
  bug.** That is the valuable outcome and it is *not* a no-op diff. Any such fix
  is guarded by the affected game's differential and snapshot tests; a fix that
  moves a differential is a real behaviour change and gets stated as one, per the
  released-oracle doctrine ("say what replaces the oracle, in the change").
- Wall-clock: the three compiler flags cost nothing at `tsc` time. Whether CI
  grows a type-aware lint step is the explicit decision above.
