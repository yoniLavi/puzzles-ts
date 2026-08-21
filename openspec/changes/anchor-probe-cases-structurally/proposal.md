# anchor-probe-cases-structurally

## Why

**`npm run probe`'s corpus anchors on verbatim source *lines*, so its
maintenance cost is proportional to how much the codebase is refactored — which
is now the opposite of what the project wants.**

Each of the 174 cases in `scripts/feedback-probe-cases.mjs` carries a `find`
string quoting a line of the module it probes, and the anchor check
(`--verify`, in the commit gate) fails when a quoted line no longer appears
**exactly once**. That check earns its place: an edit that does not apply
reports `SURVIVED`, which reads exactly like a finding, so the harness would
quietly measure a smaller corpus and report success.

It fired twice in one session (2026-08-21), and the two firings are different
things:

1. **Legitimate.** `bound-abcd-generable-sizes` changed the line
   `validateParams(params, true)`, and a case quoting it stopped applying. The
   check did its job; re-anchoring was the correct response.
2. **Pure collateral.** A follow-up added a `Midend.snapshot()` method that
   listed `timerElapsed: this.timerElapsed,` and `usedSolve: this.usedSolve,` —
   field names the save envelope also uses, at the same indentation. Two
   unrelated cases became **ambiguous** rather than missing, and the gate
   blocked on a change that had not touched the behaviour either case probes.

The second is the problem. The anchor did not break because its subject changed;
it broke because *an unrelated part of the same file grew a line that looked like
it*. And the tell is worth naming: **that collateral churn was a signal the
change was pushing against the grain** — the design it belonged to was
subsequently simplified away entirely. But a signal that fires on innocent
refactors too is noise, and AGENTS.md now actively instructs refactoring
(§ "Refactor as you go", § "Nothing is sacred").

There is a second, quieter cost. A line-quoting anchor is fragile in a way that
biases *what gets probed*: the cheapest case to keep working is one whose line is
long and unusual, which is not the same as one whose defect is interesting.

## What Changes

- **Anchor a case to a location, then a pattern within it** — a function or
  method name plus the text to replace inside its body. `find` stops needing to
  be globally unique and only needs to be unique within the function it names,
  which is where its meaning already lives (`why` is written as *"a placed digit
  is no longer ruled out of the rest of its column"* — a claim about a function,
  not about a file).
- **Keep the strictness exactly where it is.** Still abort on missing or
  non-unique; still fail the gate; still refuse to run a corpus that does not
  fully apply. The change is *what counts as the search space*, not how
  forgiving the match is.
- **Migrate the 174 existing cases mechanically**, deriving each case's
  enclosing function from where its current anchor matches — so the migration is
  checkable: every case must resolve to exactly the same replacement text it
  produces today.

## Impact

- Affected specs: `repo-layout` (the local-feedback-probe requirement).
- Affected code: `scripts/feedback-probe.mjs` (the matcher), and
  `scripts/feedback-probe-cases.mjs` (each case gains a location field).
- **The corpus's measurements must not move.** The migration is correct only if
  a full run before and after produces the identical per-module result — 174
  cases, the same catches, the same `equivalent` set. That is the acceptance
  criterion, and it is cheap to state and ~15 min to check.
- **Priority: low.** The existing scheme works and the friction is occasional.
  This is filed because the *direction of travel* (more refactoring, encouraged)
  makes the cost grow, not because it is painful today. If a session hits it a
  third time, that is the signal to pick it up.
