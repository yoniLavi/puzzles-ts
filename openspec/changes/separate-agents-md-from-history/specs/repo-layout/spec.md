# repo-layout Specification Delta — separate-agents-md-from-history

## MODIFIED Requirements

### Requirement: Agent-facing documentation is one AGENTS.md and no tool generates a second

The repository SHALL keep agent-facing documentation (strategic context,
conventions, constraints) in a single source-of-truth `AGENTS.md` at the
repository root. `CLAUDE.md` SHALL be a symbolic link to `AGENTS.md` so that
tools reading either name see the same content.

`AGENTS.md` SHALL describe **only how work is done here** — conventions, rules,
constraints, and the reasoning that makes them followable. It SHALL NOT carry a
record of work already completed. The record lives in
`docs/project-history.md`, which nothing in the workflow requires reading.

The two are separated because mixing them makes every rule ambiguous about
whether it is still in force: a reader cannot tell a convention from a note about
what two games happened to do in a particular month. A rule that has to be dated
to be understood has not finished being written. **When history is moved out, any
rule stated only inside it SHALL be lifted into `AGENTS.md` or the relevant guide
first** — the most expensive knowledge in this repository has repeatedly been the
lesson embedded in an incident write-up, and deleting the write-up without
lifting the lesson loses it silently.

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

#### Scenario: A completed change is recorded outside AGENTS.md

- **WHEN** a change is archived and its outcome is worth recording
- **THEN** the record goes to `docs/project-history.md`
- **AND** `AGENTS.md` gains only whatever rule the change established, stated in
  the present tense

#### Scenario: Moving history does not lose a rule

- **WHEN** a section is moved out of `AGENTS.md` into the history document
- **THEN** the moved text is first swept for normative statements, and each is
  either already present in a retained section, moved into one, or confirmed to
  be a fact about the past rather than a rule
