# Tasks

## 1. Recorded solver

- [ ] 1.1 Thread an optional recorder through the four deduction rules (and
      the recursion's decisive branch for D5); recorder-off path
      byte-unchanged — frozen differential stays green untouched.
- [ ] 1.2 Step budget on the recording path; tier-1 tests that each rule's
      firings record with the right evidence payload.

## 2. Plan assembly and narration

- [ ] 2.1 Firing → journey per design D2: the association move with its
      180° partner as `continuesPrevious` legs (plus forced edges); one
      firing, one journey.
- [ ] 2.2 Narration per rule in its own vocabulary (design D3), dots named
      by visible properties, rule-outs shown as evidence highlights;
      wording asserted byte-exactly.
- [ ] 2.3 Read at least two full plans aloud from real boards (one Normal,
      one Unreasonable) before polishing; record findings in design.md.
- [ ] 2.4 Unreasonable handling per design D5; decision recorded.

## 3. Engine wiring

- [ ] 3.1 `hint()` + `hintKeepTrack` + `refreshHintStep` (worked-ahead
      semantics, design D4); `uiUpdateClearsHint` reviewed against the
      discrete drag preview (a drag in progress must not fight the hint
      display).
- [ ] 3.2 Refusal → `findMistakes` + banner (design D6); test at the
      midend level.

## 4. Rendering

- [ ] 4.1 Hint highlights per the colour legend (action = the association
      target and its partner; evidence = the symmetric partner / blocked
      region as an area); equivalent moves share a colour.
- [ ] 4.2 Hint overlay in the cache planes (a hint sidecar per the
      established Galaxies pattern); tier-2.5 scenarios reaching a firing
      of each rule via fixed-seed scan, targeted op assertions + snapshots.

## 5. Enrolment and guards

- [ ] 5.1 Enrol in `testing/hint-games.ts` (auto-enrols overlay + resume
      guards); hint-quality suite additions.
- [ ] 5.2 Auto-hint pacing sanity (animation floor respected on the
      committed legs).

## 6. Docs, spec, close-out

- [ ] 6.1 `help/games/galaxies.md`: describe the hint; update
      `docs/games/hints.md` where this taught something new (live-wiki
      obligation).
- [ ] 6.2 Framework-substrate notes (what the recorder/journey shapes
      wanted that the shared machinery lacks) recorded for
      `docs/framework-rdd/`.
- [ ] 6.3 `openspec validate add-galaxies-hint --strict`; owner acceptance;
      archive.
