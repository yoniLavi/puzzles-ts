# retire-modified-spec-deltas

## Why

**`openspec archive` replaces a live requirement with the delta's copy of it, so
a delta that was written before another change touched the same requirement
silently deletes that other change's work.** It is the only mechanism in this
repository that can destroy committed work as a *side effect of following the
documented process correctly*.

It has already happened. Archiving `disambiguate-hint-deixis` (2026-08-15)
removed **134 lines** of the `ts-engine` hint requirement, and it was caught by
reading `git diff` afterwards — not by any control. `openspec validate --strict`
structurally cannot see it: a partial copy still has a `SHALL` and a scenario, so
it is a valid delta describing a smaller requirement.

The defences added since are real but all sit *downstream* of the hazard:

- `src/openspec-delta-integrity.test.ts` fails the commit when a `MODIFIED`
  delta drops a live scenario. On its first run it found **three unsafe deltas
  out of the four then active.** A three-in-four defect rate is not a mechanism
  people are using wrong; it is a mechanism that is wrong.
- `AGENTS.md` carries a paragraph of instructions — re-copy at implement time,
  prefer `ADDED`, `git diff openspec/specs/` after every archive — and the memory
  index carries a matching warning. Written guidance is what you add when the
  tool cannot be trusted.
- A scenario is only the *detectable* loss. Prose inside a requirement — the
  paragraph that says why a rule exists — has no marker, so a delta that drops
  it passes the integrity test.

**The root cause is that a `MODIFIED` delta is a full copy taken at one moment
and applied at another**, with an arbitrary gap in between. Nothing keeps the
copy fresh, and the workflow actively encourages the gap: scaffold early,
implement later.

## What this is not

**It is not "`MODIFIED` is rarely used".** Measured: **93 of 288** archived delta
files use it, and 3 of the 8 currently-open changes do. It is a third of the
history, and genuinely editing an existing rule is a real thing changes need to
do. Any option here has to keep that expressible.

## What Changes

**Decided (2026-08-21): Option A.** The owner's note that there are no other
developers here — the workflow exists to let *this agent* work effectively — is
what settles it. This is not a question of team convention; it is a question of
which mechanism an agent that scaffolds early and archives sessions later cannot
get wrong. Three were weighed:

- **Option A (chosen) — `ADDED` becomes the only delta verb, and a genuine edit
  to an existing requirement is made directly in `openspec/specs/`, as part of
  archiving.** The copy disappears, so there is nothing that *can* go stale.
- **Option B — keep `MODIFIED`, generate the copy at implement time.** Rejected:
  it keeps the mechanism and adds a step that must be run at the right moment,
  which is precisely the class of thing that failed. The existing rule already
  says "re-copy at implement time" and it did not hold.
- **Option C — status quo plus a full-text integrity check.** Rejected as the
  primary answer for the same reason, and because it grows the paragraph of
  standing instructions in `AGENTS.md` rather than removing it. Guidance is what
  you write when the tool cannot be trusted; the goal here is a tool that can.

**Why A is right specifically for an agent, which is the whole readership:** the
staleness window is created by the workflow this project deliberately runs —
scaffold the change, implement in the same session or a later one, archive after
acceptance, which may be days and several other changes later. Every other option
asks the agent to *remember* something at a moment separated from the moment the
copy was made. A has nothing to remember, because reading the live requirement is
the same act as editing it.

**The cost, taken deliberately:** a change that is later withdrawn has to have
its spec edit reverted by hand rather than by simply deleting a delta. That is
rare (the scene-graph withdrawal is the only instance) and `git revert` on one
file is the whole fix — a small, visible cost in exchange for removing a
mechanism that has already destroyed 134 lines of committed work once.

**Timing note that preserves the existing invariant:** the spec edit is made
**at archive time**, not at implement time, so `openspec/specs/` continues to
describe only accepted-and-deployed behaviour — the property that makes the specs
worth reading. The change's `proposal.md` states in prose which requirement it
will edit and how, so the intent is recorded from the start; only the *copy* is
deferred to the moment it is applied.

Under Option A:

- The three open changes using `MODIFIED` (`add-latin-repeats-support`,
  `add-slide-keyboard-control`, `audit-input-mode-parity`) are converted **by
  re-deriving them from the live spec**, not by editing the stale copies.
- `openspec/OPENSPEC_AGENTS.md` and `AGENTS.md` lose the workaround paragraph
  and gain the rule.
- `openspec-delta-integrity.test.ts` is repointed: it stops checking scenario
  survival inside `MODIFIED` deltas and starts asserting **no delta uses
  `MODIFIED` at all**, which is a check that cannot be subtly wrong.

## Impact

- Affected specs: `repo-layout` (the change-workflow requirement).
- Affected code/docs: `openspec/OPENSPEC_AGENTS.md`, `AGENTS.md`,
  `src/openspec-delta-integrity.test.ts`, the three open `MODIFIED` deltas.
- **No archived change is rewritten.** History stays as it was; the rule applies
  to changes from here on. Rewriting 93 archived delta files to a scheme they
  were never authored under would be churn with a real chance of introducing the
  very loss this change exists to prevent.
- Note the managed-block constraint: `openspec update` regenerates
  `openspec/AGENTS.md`, which this project renames. Any wording added there has
  to survive that dance, so the rule belongs in `AGENTS.md` (ours) with
  `OPENSPEC_AGENTS.md` pointing at it.
