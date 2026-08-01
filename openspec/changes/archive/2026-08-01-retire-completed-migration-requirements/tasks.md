# Tasks — retire-completed-migration-requirements

- [ ] 1.1 Remove the three per-game "parity-gated, C deleted" requirements
      (`lightup`, `pattern`, `separate`).
- [ ] 1.2 Replace `ts-migration`'s "Per-game hybrid; C deleted per game" with the
      surviving obligation (owner acceptance over a green suite). **Do not lose
      the parity bar** — it is the lesson, not the mechanism.
- [ ] 1.3 Modify `combi`'s corpus requirement: keep coverage, retire the
      regenerate-from-C scenario, state the frozen-oracle position.
- [ ] 2.1 Re-run the deleted-name sweep over the applied specs; confirm every
      remaining hit is either live code or explicitly past-tense history.
- [ ] 2.2 Gate green; `openspec validate --all --strict`; archive, then commit.
