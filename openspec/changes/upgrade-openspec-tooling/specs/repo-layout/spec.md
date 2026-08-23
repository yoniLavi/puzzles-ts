# repo-layout Specification Delta — upgrade-openspec-tooling

## ADDED Requirements

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
