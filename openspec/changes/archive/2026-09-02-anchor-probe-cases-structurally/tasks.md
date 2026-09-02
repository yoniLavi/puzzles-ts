# Tasks — anchor-probe-cases-structurally

> **Priority: low.** Filed because the cost grows as refactoring is encouraged,
> not because it hurts today. Pick it up if the anchor check fires a third time
> as collateral rather than as a real signal.

## 1. Baseline first — the acceptance criterion is "nothing moved"

- [x] 1.1 Full `npm run probe` on the unmigrated corpus, 2026-09-02, before
      any edit: **163/163 scored cases caught, 11 excluded as equivalent, every
      module 100%**; ~45 min rather than the ~15 the header claimed. Twelve
      verdicts were `T` (timeout, scored as caught) — see 4.1 for what those
      turned out to be.

## 2. The matcher

- [x] 2.1 Each case carries `within` — a function, `Class.method`, class or
      module-level constant — and `find` must match exactly once inside that
      declaration's span. `applyCase` in `feedback-probe.mjs` refuses a case
      without one.
- [x] 2.2 `scripts/feedback-probe-locate.mjs`: line-start shapes for the
      declaration (module-level at column 0 only; members and properties at any
      indentation but only *with a body*, so a call, a parameter, a field, an
      interface signature or a function type is not one), then brace-matching
      with strings, templates and comments skipped, and a brace block that is
      followed by more signature on its line (`(): { n: number } | null {`)
      read as a type rather than the body. **Ambiguity aborts** with the line
      numbers and the qualified form to use.
- [x] 2.3 Missing, non-unique (now: within the declaration), the no-op case,
      the test-file floor — all still abort; `--verify` unchanged in the gate.

## 3. Migrate the 174 cases

- [x] 3.1 Mechanical: for each case, the enclosing declaration of the offset
      where its anchor matches today, checked to contain the anchor exactly once,
      then inserted as `within:` before the case's `why:` — the k-th `why:` line
      belongs to the k-th case, and the script asserted each carried its case's
      text before writing. Getting the locator to resolve all 174 took four
      refinements, each found by the dry run rather than by reasoning:
      parameters and locals were being counted as declarations; a modified
      method (`private name(`) was judged at `private` rather than at `(`; a
      return type or generic bound with braces ended the span early; and
      `delete()` was on the reserved-word list.
- [x] 3.2 By shape: `git diff` of the corpus is **174 insertions, 0 deletions**,
      and every added line matches `^\s+within: "<name>",$`.

## 4. Prove equivalence

- [x] 4.0 **Byte equivalence, which is the stronger and deterministic form of
      4.1**: for every one of the 174 cases, the source the old file-wide matcher
      plants is byte-identical to what the scoped matcher plants. Identical
      planted files cannot measure differently.
- [x] 4.1 Full run after — compared against 1.1 below. **What the `T`s were**:
      not the corpus. `spawnSync`'s timeout kills the vitest runner but not its
      fork workers, so each timed-out case left a worker spinning a core, and
      every later case ran slower and timed out more; the baseline accumulated
      eight orphans that way. The runner now invokes the repo's own
      `scripts/reap-orphaned-workers.sh` after every timeout verdict — an
      instrument fix, recorded here because it is the one thing in this change
      that *can* move a measurement, and only towards honesty.
- [x] 4.2 Proven (scratchpad `probe-prove.mjs`, run before committing): a
      duplicate of a probed line appended elsewhere in `latin.ts` — old matcher
      aborts, new matcher applies; the probed line moved out of
      `LatinSolver.place` — new matcher aborts, naming the declaration; a second
      copy *inside* the method — aborts as ambiguous.

## 5. Close out

- [x] 5.1 `repo-layout` spec delta (ADDED). The live requirement's one sentence
      about anchors — that a pure file move leaves a quoted line valid — stays
      true, so no MODIFIED is needed.
- [x] 5.2 `docs/test-strength.md` §2a: the anchoring rule, how to add a case,
      how to re-point one, the qualified-name rule, and the corrected count and
      duration. The corpus header's rule 1 and the runner's header say the same.
- [ ] 5.3 Archive. Internal tooling with no player-visible surface; the
      decisions are recorded above, so this is self-archived per `AGENTS.md`.
