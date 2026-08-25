# repo-layout Specification Delta — separate-agents-md-from-history

## MODIFIED Requirements

### Requirement: Agent-facing documentation is one AGENTS.md and no tool generates a second

The repository SHALL keep agent-facing documentation (strategic context,
conventions, constraints) in a single source-of-truth `AGENTS.md` at the
repository root. `CLAUDE.md` SHALL be a symbolic link to `AGENTS.md` so that
tools reading either name see the same content.

`AGENTS.md` SHALL describe **only how work is done here** — conventions, rules,
constraints, and the reasoning that makes them followable. It SHALL NOT carry a
record of work already completed, and **no such record SHALL be hand-maintained
anywhere**. The record is `openspec/changes/archive/`, one directory per change
with its proposal, tasks and design, plus `openspec/postmortems/` for directions
tried and dropped, plus the git log. All three are produced by the workflow as a
side effect of doing the work.

Mixing the two makes every rule ambiguous about whether it is still in force: a
reader cannot tell a convention from a note about what two games happened to do
in a particular month. A rule that has to be dated to be understood has not
finished being written. Where a completed change established a rule, that rule
SHALL appear in `AGENTS.md` in the present tense, with no date and no change id.

**When history is removed, any rule stated only inside it SHALL be lifted out
first.** The most expensive knowledge in this repository has repeatedly been the
lesson embedded in an incident write-up; deleting the write-up without lifting
the lesson loses it silently, and a sweep for normative language is what catches
it.

No tool SHALL generate a second agent-facing instruction file inside the
repository. Project guidance about how a tool is used here belongs in `AGENTS.md`,
where nothing rewrites it — a generated file that must be edited to be correct is
a file whose corrections have an expiry date, and the corrections are what a
reader most needs.

#### Scenario: CLAUDE.md and AGENTS.md never drift

- **WHEN** a contributor reads `CLAUDE.md`
- **THEN** the content is identical to `AGENTS.md`
- **AND** `readlink CLAUDE.md` resolves to `AGENTS.md`

#### Scenario: openspec generates no second instruction file

- **WHEN** the repository is searched for an openspec-generated instruction file
- **THEN** neither `openspec/AGENTS.md` nor `openspec/OPENSPEC_AGENTS.md` exists
- **AND** the workflow is reached through the installed `openspec-*` skills

#### Scenario: Running the tool's update does not silently overwrite

- **WHEN** a contributor runs `openspec update`
- **THEN** it reports what it would change and requires confirmation or `--force`
  rather than rewriting files unprompted
- **AND** project-authored content in `AGENTS.md` survives the run untouched

#### Scenario: A completed change is recorded by the workflow, not by hand

- **WHEN** a change is archived
- **THEN** its record is the archived change directory and the git log, with no
  digest of it written into any maintained document
- **AND** `AGENTS.md` gains only whatever rule the change established, stated in
  the present tense

#### Scenario: Removing history does not lose a rule

- **WHEN** history is removed from a maintained document
- **THEN** the removed text is first swept for normative statements, and each is
  either already present in a retained section, lifted into one, or confirmed to
  be a fact about the past rather than a rule

## ADDED Requirements

### Requirement: A change the agent scoped and decided is archived without an acceptance checkpoint

A change whose scope, design and implementation the agent decided SHALL be
implemented, verified, committed and **archived in the same session**, without
pausing for the owner to accept it.

Owner acceptance SHALL be required only where the owner is the only possible
judge of correctness:

- work a player can see or feel — how a game plays, renders, animates or responds
  to input, and any wording a player reads;
- work the owner specified by name, where they described the outcome;
- anything that breaks compatibility with data a player already holds, which
  SHALL be raised **before** the work, with the cost stated.

Everything else — an internal contract, a helper's shape, a test harness, a
documentation restructure, or a spec requirement recording a decision the agent
made and can defend — is an implementation detail, and a spec delta describing it
is not made more correct by a second signature. Asking is the error rather than
the safe option: it converts a decision the agent already owns into a queue item
on someone else's desk, and a queue with one server is where work goes to wait.

#### Scenario: An agent-initiated change completes without a checkpoint

- **WHEN** the agent has scoped, implemented and verified a change it decided on
- **THEN** it commits and archives the change in the same session
- **AND** it does not ask for acceptance first

#### Scenario: Player-visible work still waits

- **WHEN** a change alters how a game plays, renders or reads to a player
- **THEN** owner acceptance is required before archiving, on the terms in
  "Acceptance bar"

#### Scenario: A compatibility break is raised before the work, not after

- **WHEN** a change would invalidate saves, preference keys or shared game IDs a
  player already holds
- **THEN** the owner is asked before the work starts, with the cost stated
