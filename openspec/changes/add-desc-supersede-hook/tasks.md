# Tasks

- [ ] 1.1 Decide the hook shape (design.md — leading option: post-transition
      `Game.supersededDesc`); record the decision and why.
- [ ] 1.2 Implement the `Game` hook + `Midend` desc/privDesc replacement + id-change
      notification; verify the app shell's shareable id refreshes (check
      `emitIdChange` end-to-end, not just the midend).
- [ ] 1.3 Save-codec: persist desc + privDesc; restore prefers privDesc; round-trip
      test.
- [ ] 1.4 Tier-1 behavioural tests with a fake supersede-using game: supersede fires
      once, id notification emitted, restart uses the superseded desc, undo does not
      un-supersede, save/load round-trips.
- [ ] 1.5 Playbook note (desc-superseding games) — keep it link-only to the spec.
- [ ] 1.6 Gate (`tsc` → lint → vitest → build) + `openspec validate --strict`; owner
      review of the hook shape before the Mines port builds on it.
