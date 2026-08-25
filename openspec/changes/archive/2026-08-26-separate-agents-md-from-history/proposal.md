# separate-agents-md-from-history

## Why

**`AGENTS.md` is the file every agent reads before doing anything, and 43% of it
was a record of work already finished.** Owner: *"I want it to have exactly zero
'what's been done' content — it should only be about how we do things."*

Measured on the file before this change (581 lines):

| section | lines | what it is |
|---|---|---|
| What's been done | 182 | a changelog, in a section captioned "durable reference, not a changelog" |
| Migration order | 56 | a plan whose every item is complete |
| Helper extractions: status | 13 | status of three extractions that all landed |
| C deletion: per game | 4 | policy for a language no longer in the tree |

The cost is not length. A reader looking for the rule about cache keys had to
distinguish *"Galaxies and Sixteen use `Int32Array`"* — a fact about two games in
one month — from *"use the packed-bits pattern, not `BigInt64Array`"*, which is
the instruction. **History and instruction in one file makes every rule ambiguous
about whether it is still in force.**

## What Changes

- **`AGENTS.md` becomes exclusively about how work is done here.** The four
  sections go. Remaining sections are swept for past-tense chronicle and restated
  as present-tense rules — a rule that has to be dated to be understood has not
  finished being written.
- **A new `## Method` section** carrying the cross-cutting rules that were only
  ever stated inside incident write-ups. These are the ones that recur: each has
  been rediscovered four to six times, which is exactly the argument for stating
  them where they get read.
- **The history is deleted, not relocated.** The first cut of this change moved
  it to a new `docs/project-history.md`. The owner rejected that on sight —
  *"isn't that what the git log and openspec/changes/archive/ are for? To me it
  just seems like a waste of time keeping that up to date"* — and was right. See
  below.
- **Owner acceptance stops gating agent-initiated changes.** Owner: *"there's no
  need to ask me to accept spec changes that I didn't actually create myself…
  just archive it with the same self-driven initiative that you created it
  with."* Acceptance narrows to work only the owner can judge: player-visible
  behaviour, work they specified by name, and compatibility breaks (raised
  *before*, not after).

## Why deleting beat relocating

**Checked rather than conceded.** Of the 64 change ids the relocated document
named, **59 resolve to a directory under `openspec/changes/archive/`**, each
holding that change's full proposal, tasks and design. The five that do not are
all withdrawn or never-implemented — and the two that mattered
(`scaffold-scene-graph-game-contract`/`add-scene-graph-reconciler`, and
`retire-modified-spec-deltas`) **already have postmortems** under
`openspec/postmortems/`.

So the pattern is complete without it: **implemented changes are recorded by the
archive, abandoned ones by a postmortem, and both fall out of the workflow
automatically.** A maintained digest of them is a third copy, with a maintenance
tax and no reader — and this repository has watched second copies rot three times
in a fortnight (`openspec/project.md` describing deleted directories, the
per-game `## Status` help sections, the halibut manual documenting a different
program). Its own rule applies: *ask not "is it true?" but "who reads it, and
what would they do differently without it?"*

The relocated document answered that question against itself. Its opening line
was *"nothing here needs to be read to do a piece of work"* — a document arguing
for its own deletion.

## Impact

- **Affected specs**: `repo-layout` — the AGENTS.md requirement (MODIFIED, copied
  from the live text at implementation time), plus an ADDED requirement for the
  acceptance rule.
- **Affected docs**: `AGENTS.md` (and `CLAUDE.md`, its symlink), `README.md`,
  `openspec/config.yaml`.
- **Risk**: a silently dropped rule. Mitigated by sweeping the removed text for
  normative language before deleting. **The sweep earned its place twice** — once
  before the move (two rules stated nowhere else) and once before the deletion,
  which found a third, *"do not repoint a dead recipe — retire it"*. All three
  are now in `## Method`.
- **Not in this change**: `docs/games/` and `docs/test-strength.md`, already
  correctly scoped as "how" documents.
