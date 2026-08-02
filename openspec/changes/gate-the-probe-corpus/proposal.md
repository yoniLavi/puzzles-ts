# gate-the-probe-corpus

## Why

`npm run probe`'s corpus is 93 **verbatim excerpts of engine source**, used as
search anchors. That is what makes each case a real defect a reader can name —
and it is also the corpus's one fragility: refactor a probed line and its anchor
silently stops matching.

Nothing catches that today. The full run is ~20 minutes and deliberately outside
the gate, so a rotted corpus stays rotted until someone happens to run it, and
the failure mode is the worst kind — **the harness reports a smaller corpus
rather than an error**, which reads like everything is fine.

`--verify` is exactly this check and costs **~0.2 s**: it applies every anchor
and aborts if one is missing or non-unique, running no tests at all.

## What Changes

- **Add `node scripts/feedback-probe.mjs --verify` to the gate's fast fail-fast
  prefix**, after biome. It is the cheapest check in the gate by an order of
  magnitude and the only one protecting a diagnostic the gate does not run.
- The friction is intended: a refactor that moves a probed line must re-anchor
  its case, which is the moment a human decides whether the case still states
  the defect it claims to.

## What this is deliberately not

**Not gating the probe itself.** The 20-minute run stays opt-in, with the same
standing as `npm run metrics` and `npm run mutation`. What is gated is only that
the corpus still *applies* — never its result. A survivor remains a finding to
read, never a build failure, because a gated feedback rate is a ratchet and the
`repo-layout` requirement forbids one.

## Impact

- Affected specs: `build-pipeline` (the gate's check list grows from four to
  five; the new one belongs to the fail-fast prefix).
- Affected code: `scripts/gate.sh`, `.husky/pre-commit` comment,
  `docs/test-strength.md`.
