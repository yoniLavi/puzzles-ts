# Tasks — anchor-probe-cases-structurally

> **Priority: low.** Filed because the cost grows as refactoring is encouraged,
> not because it hurts today. Pick it up if the anchor check fires a third time
> as collateral rather than as a real signal.

## 1. Baseline first — the acceptance criterion is "nothing moved"

- [ ] 1.1 Full `npm run probe` on the current corpus (~15 min); keep the
      per-module output. This is the artefact the migration is checked against.
      Take it **before** touching anything: a baseline taken afterwards proves
      nothing.

## 2. The matcher

- [ ] 2.1 A case gains a location — enclosing function/method name — and `find`
      becomes "unique within that function" rather than "unique in the file".
- [ ] 2.2 Locating a function body in TS source without a parser: brace-match
      from the declaration, the way the existing tooling does. Accept the known
      limitation (a nested function of the same name) by **aborting** on
      ambiguity rather than guessing — the harness's existing rule, and the
      reason it can be trusted.
- [ ] 2.3 Keep every current failure mode: missing anchor, non-unique anchor,
      and the test-file floor all still abort, and `--verify` still runs in the
      gate at ~0.2 s.

## 3. Migrate the 174 cases

- [ ] 3.1 Derive each case's enclosing function mechanically from where its
      current anchor matches — do not hand-assign, and do not hand-edit the
      `find` strings, which is how a migration introduces a case that probes
      something subtly different.
- [ ] 3.2 Verify by **shape**: every changed line in the diff is an added
      location field, and no `find`/`replace`/`why`/`equivalent` value changed.
      (The repo's standing method for a bulk edit — assert the whole diff is the
      one intended kind of change, then read the exceptions.)

## 4. Prove equivalence

- [ ] 4.1 Full `npm run probe` again; require an **identical** result to 1.1 —
      same 174 cases, same catches, same `equivalent` set, same per-module rate.
      Any difference is a migration bug, not an improvement.
- [ ] 4.2 Prove the new matcher still fails when it should: move a probed line
      out of its function, confirm the abort; add a duplicate of a probed line
      *elsewhere in the same file* and confirm it now **passes** (that is the
      whole point of the change).

## 5. Close out

- [ ] 5.1 `repo-layout` spec delta.
- [ ] 5.2 `docs/test-strength.md` §2a describes the probe; update the anchoring
      rule there, since it is the page that tells the next author how to add a
      case.
- [ ] 5.3 Owner acceptance, then archive.
