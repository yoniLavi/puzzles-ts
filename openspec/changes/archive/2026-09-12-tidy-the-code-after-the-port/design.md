## Context

See proposal.md for the motivation and the measurements. The constraints that
shape the approach:

- **The net that proves "no behavior change" already exists.** Most games carry
  a frozen differential, and many carry tier-2.5 render snapshots. A
  simplification that changes a generator's or solver's verdict changes which
  boards exist, and the differential fails. This pass leans on that net rather
  than building a new one.
- **Provenance comments and absence guards are already protected** by the
  repo-layout requirement "A comment stating a procedure is executable, or is
  marked as history". The new requirement sits beside it and does not reopen it.
- **The engine is anchored.** The local-feedback probe quotes source lines in
  engine modules, and the guides cite engine and game function names.
- **The machine is memory-bound**, sitting deep in swap. Parallel test runs are
  the scarce resource, not agents.
- **The commit hook tests the working tree, not the index.** A commit made
  while another game is half-edited runs its tests against that half-edit.

## Goals / Non-Goals

**Goals:**

- Fewer lines, with each game reading as this project's own code.
- A rubric light enough to apply by judgment, recorded where new games will
  find it.

**Non-Goals:**

- Extracting shared helpers. An extraction noticed during the pass is recorded
  in the commit message or as a scaffolded follow-up, not made. Mixing
  extraction into a style pass would make the diff unreviewable by shape.
- Any change a player could see, including a changed board for a given seed.
- Reformatting for its own sake. Biome already owns layout.
- Hitting a line-count target. The count is a check that the pass went the
  right direction, never a goal to optimize; `scripts/metrics.sh` explains why
  lines of code applaud the wrong thing.

## Decisions

**One game is one unit.** A game's directory is self-contained, its tests are
selected by the hook, and its diff reads on its own. Small games may share a
commit when their passes are trivially alike. The alternative, one sweep per
kind of edit across all games, was rejected because it touches every file
several times and makes each diff hard to judge in context.

**The rubric is a reading test, stated once.** The requirement gives the test
and a few examples. It is deliberately not a checklist: the pilot is where the
judgment gets calibrated, and a list written before the pilot would encode
guesses.

**Pilot three games before fanning out.** Galaxies is the guides' exemplar,
Slide is among the densest-commented, and Bridges among the least. Together
they show whether the rubric produces the same kind of diff at both ends of the
range. The rubric may be revised after the pilot.

**Subagents in waves, editing disjoint directories in the main tree.** Each
agent owns one game's directory and runs its own tests plus the cross-game
guards filtered to its game, under `nice` with a capped worker pool. It does not
commit. Between waves, with nothing mid-edit, the orchestrator reviews the
diffs and commits. A wave is three agents, sized to the memory headroom.
Worktrees were rejected: they create branches, and this repo is trunk-based.

**Each agent works in its own shared clone, and each game is one commit.**
The gate typechecks and tests the working tree, not the index, so an agent
editing the main tree blocks every commit until it finishes; the first wave
ran that way and spent most of its time waiting. A `git clone --shared` in the
scratchpad takes a second and 30 MB, sits on `main` with no new branch, and
runs the gate's tools against the repo's own `node_modules`. The orchestrator
applies a finished clone's diff to the main tree (refusing any path outside
the agent's scope, and any new file) and commits it at once, while the other
agents keep working. Three agents run at a time, the memory ceiling, and a
slot is refilled as soon as it frees.

**Verification per unit.** The game's tests pass with its differentials and
snapshots unchanged, no snapshot is re-recorded, and the diff removes more than
it adds. A pure rename is checked with `scripts/check-rename-shape.mjs --fold`.
A renamed function cited in `docs/` is repointed in the same commit.

**The app shell and the build tooling follow the engine.** The owner's ask
was all of the code, and the shell carries the same 19% comment share as the
games. Its pins are different: custom element names, public properties and
event names are the app's DOM vocabulary, and the gate scripts are the gate.
Most tests assert state rather than a template's output, so the shell's pass is
checked by its component tests and then by opening the app at close.

**The engine goes after the games and is done more carefully.** It is what every game
reads, it is probe-anchored, and a rename there reaches every game. Games first
also means any engine name the games have already worked around is visible by
the time the engine is touched.

## Risks / Trade-offs

- [An agent deletes a comment that was load-bearing] → The rubric names the
  kinds that stay, and the orchestrator reads each diff's removed comments
  before committing. Sampling showed most comments here are good; a pass that
  removes most of a file's comments is a signal to look harder, not a success.
- [A simplification changes behavior the net does not cover] → An agent
  simplifies logic only where a differential, a snapshot or a behavioral test
  reaches it, and says which in its report. Uncovered logic keeps its shape.
- [Terser code in pursuit of fewer lines] → The requirement defines a
  simplification as shorter *and* easier to read. Dense one-liners and nested
  ternaries that replace a readable block are not an improvement.
- [Renames ripple into docs, tests and probe anchors] → The gate's probe
  anchor check catches the engine case; a grep of `docs/` for the old name
  catches the guide case, as part of each unit.
- [Parallel test runs push the machine further into swap] → Small waves,
  targeted test runs, and stopping rather than re-running on a contention flake.
- [A simplification slows a hot loop, which no test notices] → A solver or
  generator loop is restructured only with a paired, interleaved timing
  against HEAD and an A/A pair for the noise. The Slide pilot's tidied solver
  passed every test and ran 13% slower, from dropping a cache that looked dead;
  it was reverted. The same harness asserts identical output over seeds the
  fixtures do not cover, which matters where a differential checks only the
  solver's verdicts and never the generator's boards.
- [A game's own tests pass and the commit still fails] → Cross-game guards
  check a game's input, save, params and source text from outside its
  directory. Agents run the whole guard list filtered to their game.
