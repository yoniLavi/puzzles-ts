# repo-layout Specification Delta — upgrade-openspec-tooling

## REMOVED Requirements

### Requirement: Agent-facing documentation lives in a single AGENTS.md

**Reason**: Two of its three scenarios describe a mechanism that no longer
exists. Before 1.0 the openspec CLI generated an `openspec/AGENTS.md` that
collided with this project's root `AGENTS.md`, so the requirement mandated
renaming it to `OPENSPEC_AGENTS.md`, pointing a managed
`<!-- OPENSPEC:START --> … <!-- OPENSPEC:END -->` block at the renamed copy, and
redoing both after every `openspec update`. From 1.0 the workflow instructions
ship as installed skills and no such file is generated, so the collision, the
rename and the managed block are all gone.

Retired rather than modified because the scenario names are the requirement's
identity, and *"openspec instructions are at OPENSPEC_AGENTS.md"* cannot be made
truthful by rewriting its body — it would then assert the opposite of its own
name. `openspec validate` refuses the rename outright (it reads a renamed
scenario as a dropped one, which is the check working), and this project does not
let a name survive that contradicts what it labels.

**Migration**: The half that is still true — one source-of-truth `AGENTS.md`,
with `CLAUDE.md` a symlink to it — carries over verbatim into the added
requirement below, along with its unchanged scenario.

## ADDED Requirements

### Requirement: Agent-facing documentation is one AGENTS.md and no tool generates a second

The repository SHALL keep agent-facing documentation (strategic context,
conventions, constraints) in a single source-of-truth `AGENTS.md` at the
repository root. `CLAUDE.md` SHALL be a symbolic link to `AGENTS.md` so that
tools reading either name see the same content.

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

### Requirement: The openspec CLI is pinned by the repository and its floor is asserted

The `openspec` CLI SHALL be declared as a dependency of this repository at a
stated version, and a minimum version SHALL be asserted mechanically, so that a
machine running an older CLI is told rather than allowed to proceed.

A tool that decides what the specs say is part of the build, not part of the
workstation. This one was installed globally and never named by any file in the
repository, so its version was a property of one laptop: it sat nine months and
fifteen releases behind while a defect it had long since fixed was worked around
inside the repository instead. **Checking what the installed tool does and
generalising it to what the tool does is the dependency form of trusting an
instrument without checking it**, and a pinned version is what makes that check
answerable from inside the repository at all.

The floor SHALL be at least the version at which `openspec archive` refuses to
drop a scenario a live requirement still has, since below that the archiver can
silently delete committed work.

The commit gate SHALL run the CLI's own validation over the specs and every open
change, so that a delta which would lose work blocks a commit rather than
surfacing at archive time.

#### Scenario: An older CLI is refused rather than trusted

- **WHEN** the assertion runs against an openspec CLI below the stated floor
- **THEN** it fails, naming the installed version and the required one

#### Scenario: The repository states the version it expects

- **WHEN** a reader asks which openspec the workflow assumes
- **THEN** the answer is in the repository's own dependency declaration, not in
  whatever happens to be installed on the machine

#### Scenario: Setup is still a single install step

- **WHEN** a fresh checkout is prepared for work
- **THEN** the documented setup command installs the pinned CLI along with
  everything else, with no separate global install required

#### Scenario: A stale delta blocks the commit, not the archive

- **WHEN** an open change carries a MODIFIED delta omitting a scenario the live
  requirement still has
- **THEN** the commit gate fails, naming the scenarios to copy back
