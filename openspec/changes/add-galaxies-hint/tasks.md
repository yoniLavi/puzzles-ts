# Tasks

## 1. Recorded solver

- [x] 1.1 Thread an optional recorder through the four deduction rules (and
      the recursion's decisive branch for D5); recorder-off path
      byte-unchanged — frozen differential stays green untouched.
      *(`SolverRecorder` in `solver.ts`; the generator/solve path passes none.
      D5 became refutation rather than a recursion recording — design F4.)*
- [x] 1.2 Step budget on the recording path; tier-1 tests that each rule's
      firings record with the right evidence payload.

## 2. Plan assembly and narration

- [x] 2.1 Firing → journey per design D2: **overturned** — the game commits a
      tile and its partner atomically, so a partner leg would be a *no-op
      move* the cross-game guard forbids. One firing = one step, both cells
      as targets (design F1).
- [x] 2.2 Narration per rule in its own vocabulary (design D3), dots named
      by visible properties, rule-outs shown as evidence highlights;
      wording asserted byte-exactly.
- [x] 2.3 Read at least two full plans aloud from real boards (one Normal,
      one Unreasonable) before polishing; record findings in design.md.
      *(Did it, and it changed the design: rung order, the mirror-wall
      demotion and three wordings — design F2/F3.)*
- [x] 2.4 Unreasonable handling per design D5; decision recorded (F4).

## 3. Engine wiring

- [x] 3.1 `hint()` + `hintKeepTrack` + `refreshHintStep` (worked-ahead
      semantics, design D4); `uiUpdateClearsHint` reviewed against the
      discrete drag preview and deliberately not implemented (F6) — a drag
      in progress is the player *following* the hint.
- [x] 3.2 Refusal → `findMistakes` + banner (design D6); verified live
      (a wall drawn inside a galaxy reds the wall and refuses).

## 4. Rendering

- [x] 4.1 Hint highlights per the colour legend; the hint hue moved to purple
      because the drag preview already holds blue **on the same objects**
      (design F5).
- [x] 4.2 Hint overlay in the cache planes (`ds.hint` sidecar); tier-2.5
      scenarios with targeted op assertions + a snapshot
      (`galaxies-hint-render.test.ts`).

## 5. Enrolment and guards

- [x] 5.1 Enrol in `testing/hint-games.ts` (auto-enrols overlay + resume
      guards) and in `hint-quality.test.ts`'s deductive set; game-local
      hint-quality tests in `galaxies-hint.test.ts`.
- [x] 5.2 Auto-hint pacing sanity — checked live; Galaxies has no move
      animation, so each step takes the uniform `AUTO_HINT_STEP_MS`.

## 6. Docs, spec, close-out

- [x] 6.1 `help/games/galaxies.md` describes the hint; `docs/games/hints.md`
      gained the notation-vs-goal section, the colour-legend row and the
      second precedent for the hint hue moving.
- [x] 6.2 Framework-substrate note recorded in
      `docs/framework-rdd/deduction.md` § "A game may have two move sets, and
      the projections split across them".
- [ ] 6.3 `openspec validate add-galaxies-hint --strict`; owner acceptance;
      archive.
