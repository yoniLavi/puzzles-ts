# separate-agents-md-from-history

## Why

**`AGENTS.md` is the file every agent reads before doing anything, and 43% of it
is a record of work already finished.** Owner directive, 2026-08-25: *"I want it
to have exactly zero 'what's been done' content — it should only be about how we
do things."*

Measured on the current file (580 lines):

| section | lines | what it is |
|---|---|---|
| What's been done | 182 | a changelog, stated to be "durable reference, not a changelog" |
| Migration order | 56 | a plan whose every item is complete |
| Helper extractions: status | 13 | status of three extractions that all landed |
| C deletion: per game | 4 | policy for a language no longer in the tree |

That is **255 lines of history in a document whose job is instruction**, and the
cost is not just length. A reader looking for the rule about, say, cache keys has
to distinguish *"Galaxies and Sixteen use `Int32Array`"* — a fact about two games
in 2026-05 — from *"use the packed-bits pattern, not `BigInt64Array`"*, which is
the instruction. History and instruction in one file makes every rule ambiguous
about whether it is still in force.

**The trap this must avoid: several genuinely load-bearing rules exist *only*
inside history bullets.** "A guard must measure the thing it claims to guard,
not a neighbour" is stated nowhere except in the six incident write-ups that
found it. Deleting the chronicle without lifting those out would destroy the most
expensive knowledge in the repository. **Extraction, not deletion**, is the whole
job: the record moves, and every rule embedded in it is either already stated in
a "how" section, moved into one, or moved into the relevant `docs/` guide.

## What Changes

- **`docs/project-history.md`** — a new document holding the record: what was
  built, in what order, what each change found. It is written to be *read*, not
  consulted mid-task, and nothing in the workflow requires reading it.
- **`AGENTS.md` becomes exclusively about how work is done here.** The four
  sections above are removed. The remaining sections are swept for past-tense
  chronicle and restated as present-tense rules — a rule that has to be dated to
  be understood is a rule that has not been finished being written.
- **A new `## Method` section** carrying the cross-cutting rules that were only
  ever stated inside incident write-ups. These are the ones that recur: they have
  been rediscovered between four and six times each, which is precisely the
  argument for stating them where they will be read.
- **Illustrative examples stay, chronicles go.** A worked example that teaches a
  rule is instruction — `grid_trim_vigorously`'s 576 MB matrix is *why* "diverge
  where the C shape doesn't fit a browser" is a rule. A list of which games
  shipped when is not. The test is whether removing the date and the change-id
  damages the sentence.

## Impact

- **Affected specs**: `repo-layout` — "Agent-facing documentation is one AGENTS.md
  and no tool generates a second" currently requires *strategic context,
  conventions and constraints* to live in one file, which this splits. MODIFIED,
  written at implementation time from the live text.
- **Affected docs**: `AGENTS.md` (and therefore `CLAUDE.md`, its symlink),
  the new `docs/project-history.md`, `docs/games/README.md` if it cites a moved
  section.
- **Risk, and how it is managed**: the failure mode is a silently dropped rule.
  Mitigated by sweeping the removed text for normative language (`SHALL`, `must`,
  `never`, `always`, `don't`, imperative openers) **before** deleting, and
  checking each hit is either already stated in a kept section, moved into one,
  or genuinely history. The sweep is recorded in `tasks.md` rather than being
  claimed.
- **Not in this change**: the `docs/games/` guides and `docs/test-strength.md`,
  which are already "how" documents and already correctly scoped.
