# audit-declared-versus-derived-capabilities — tasks

Scaffolded 2026-09-06. **Investigation.** The deliverable is a recorded decision
and the doc amendments it implies; code, if any, is small.

## 0. Survey, with the population read rather than sampled

- [ ] 0.1 `/opsx:explore`.
- [ ] 0.2 **Every guarantee in `guarantees.md`'s table, classified**: is it
      derivable from what a game *is* (an object it registers, a `Ui` field, a
      method's presence, its own source), or does it need declared *intent*?
      Read the whole table — it is short — rather than reasoning from the two
      or three rows that come to mind.
- [ ] 0.3 **Every existing cross-game guard, classified the same way.** Sixteen
      files derive a population from the registry and sixteen scan source
      (measured 2026-09-05). For each: what is the enrollment fact, and could a
      declaration have done better? A guard that *would* have been better as a
      declaration is the most useful thing this survey can find.
- [ ] 0.4 **Count the declarations that already exist and are not derived**, and
      check each against the `needsRightButton` test: does anything *read* it,
      and would a reader do something different without it? That check has
      already deleted eighteen declarations once.
- [ ] 0.5 Settle the three open questions in the proposal — intent that behavior
      cannot show, the capability-manifest diff, discoverability — each with
      evidence rather than a preference.
- [ ] 0.6 Rewrite this task list from what the survey finds.

## Standing constraints

- [ ] C1 **Four data points is not a trend, and they are all from one end.**
      Border-grid input, border-grid render, the note-taking cell and the
      withdrawn gesture table are all input/rendering. The deduction end has had
      three rounds of pressure and may answer differently; `deduction.md`'s
      technique ladder is the row of `guarantees.md`'s table most likely to want
      a real declaration. Do not generalize from input to the whole framework
      without looking at it.
- [ ] C2 **A survey that only confirms is a survey that was not run.** The
      proposal names three ways this comes out against its own hypothesis; if
      none of them is examined seriously, the finding is worth nothing. This
      repo has produced a fictional defect from exactly that shape before.
- [ ] C3 The `NO_KEYBOARD` pattern — derive the fact, declare the intent, assert
      they agree — is a candidate *answer*, not a foregone one. It costs a list;
      the question is whether the list earns it, which is the question
      `needsRightButton` failed.
- [ ] C4 No RDD passage may be left claiming unshipped behavior in the present
      tense, and none may leave shipped behavior reading as future
      (`repo-layout`, "Design-fiction docs are labeled and quarantined"). If the
      frame changes, every marker moves with it.
- [ ] C5 Feed `adopt-the-game-definition-adapter` rather than pre-empting it.
      That change owns the definition-object decision; this one owes it evidence
      about whether concerns stand alone.
