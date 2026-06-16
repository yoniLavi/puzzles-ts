# Tasks: Codify the game-port and hint-authoring playbooks

## 1. Scaffold
- [x] 1.1 Create `docs/porting/` and stub the two guides with a shared
  "provisional v1; link-only to specs" header.

## 2. Game Port Playbook (`docs/porting/game-port-playbook.md`)
- [x] 2.1 Picking the next game + the long-tail-risk pre-flight checklist
  (`supersede_desc`, undo-by-state-equality, EDITOR letters, printing).
- [x] 2.2 File layout + idiomatic-TS rules + the `Int32Array` packed-cache-key
  pattern (not `BigInt`).
- [x] 2.3 The two-stage parity gate (register → owner-accept → flip
  `TS_PORTED` + delete `.c`) and the empty-registry fallback.
- [x] 2.4 Differential check + the test tiers to write (1 / 2 / 2.5 / 3).
- [x] 2.5 Cross-links to `ts-migration`, `repo-layout`, exemplar (Galaxies).

## 3. Hint Authoring Guide (`docs/porting/hint-authoring.md`)
- [x] 3.1 The Palisade quality bar (explain *why*; one deduction = one journey;
  equivalent moves share a colour; uniform pacing).
- [x] 3.2 Mechanics: `hint()`/`HintResult`/`HintStep`/plan, `hintKeepTrack`,
  `continuesPrevious`, refusal → `findMistakes` + banner.
- [x] 3.3 Render conventions (`COL_HINT`, preview marks) and tier-2.5
  render-scenario verification.
- [x] 3.4 The empirical-probe method lesson + `AUTO_HINT_STEP_MS` pacing.
- [x] 3.5 Cross-links to `ts-engine` hint requirements + exemplars
  (Palisade, Range).

## 4. Spec + pointers
- [x] 4.1 `repo-layout` delta: `docs/` sanctioned; dev guides live there,
  link-only to specs.
- [x] 4.2 Add one-line pointers from the relevant `AGENTS.md` sections to the
  guides ("TS port style" → playbook, "Hint quality bar" → hint guide; the
  playbook links onward to "Test discipline" and "Long-tail risks").

## 5. Validate + gate
- [x] 5.1 `openspec validate add-game-dev-guides --strict`.
- [ ] 5.2 Full pre-commit gate green; commit (provisional v1).

## 6. Battle-test on port #15 (before archive)
- [ ] 6.1 Execute the next game port by literally following the playbook.
- [ ] 6.2 Fix every gap / wrong step the port surfaces, in the guide.
- [ ] 6.3 Owner sign-off that the guides are now trustworthy; archive.
