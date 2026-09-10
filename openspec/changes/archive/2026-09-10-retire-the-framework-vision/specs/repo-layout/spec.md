## MODIFIED Requirements

### Requirement: Design-fiction docs are labeled and quarantined

Design-fiction documents SHALL be labeled and quarantined: documents that
describe a designed-but-unimplemented architecture (readme-driven
development artifacts) SHALL live under a directory whose name marks them as
vision material, and every file in it SHALL open with a
status banner stating that it describes a system that does not exist yet and
naming the change or session that authored it. A design-fiction doc SHALL NOT be
cited from code, specs, or the current-architecture guides as if it described
shipped behavior; the current-architecture guides MAY link to it explicitly as
future direction. When part of the fiction ships, the shipped part moves into
the real guides/specs in the shipping change, and the fiction is updated or
retired rather than left claiming the present tense.

The one such directory this repository has had, `docs/framework-rdd/`, was
retired by `retire-the-framework-vision` (2026-09-10) once every part of it had
shipped, completed, been withdrawn or reported. This requirement stays for the
next one.

#### Scenario: A reader opens a vision doc

- **WHEN** any file under a design-fiction directory is opened
- **THEN** its first visible block states it is design fiction, not a
  description of the current system

#### Scenario: Fiction ships

- **WHEN** a change implements a mechanism the fiction describes
- **THEN** that change moves the now-true material into the real guides or
  specs and updates the fiction so no file claims unshipped behavior in the
  present tense

### Requirement: A design-fiction doc SHALL NOT carry a hand-maintained status column

A design-fiction document SHALL NOT hold a progress table, readiness column, or
any other per-item status the repository maintains by hand. An item's outcome
SHALL be stated at the claim it corrects, and "what remains" SHALL resolve
through `openspec list` and the archive rather than through a column.

The existing quarantine requirement covers a doc whose *mechanism* ships. This
covers a doc whose *plan* finishes, which is a different failure and the one that
actually occurred: the vision README's "Where this stands" argued at length that a
hand-maintained status column drifts — citing the `openspec/project.md` that ended
up describing deleted directories — and then printed a six-row table with a
Readiness column. Row 6 read "survives, route changed … one owner question decides
its shape" for three days after that question was answered, the change was executed
in eight batches and archived, so the page's own scoreboard told a reader the last
live question in the definition end was open when the whole end had reported.

**The mechanism of the drift is the part worth generalizing**: completing
`re-express-the-collection` required touching nothing anywhere near that table.
A status column rots precisely because keeping it true is nobody's job at the
moment it becomes false, whereas a marker at the claim is edited by whoever
changes the claim.

**While a vision is live, a withdrawn or completed item SHALL be struck through
and kept with its argument**, never deleted. The withdrawals of the gesture table,
the board model and the definition adapter were the most reused prose in the
retired directory precisely because the reasoning survived the verdict; a
deletion would have left the next session free to re-propose them. Each
withdrawal SHALL also have its postmortem under `openspec/postmortems/`, which is
where the argument outlives the vision.

**A vision doc SHALL NOT be the home of a rule that has become live.** When a
passage becomes true, the rule moves to `AGENTS.md`, a `docs/games/` guide or a
spec, and the vision links to it — because a live rule whose only statement sits
inside a document banner-labeled as fiction cannot be cited by the code that obeys
it.

**When every item a vision argues for has shipped, completed, been withdrawn or
reported, the vision SHALL be retired**: every section is accounted for, each rule
it still holds moves to `AGENTS.md`, a `docs/games/` guide or a spec, each
withdrawal is confirmed to have its postmortem, the live citations of the directory
are repointed, and the directory is deleted. Struck-through passages in a document
nobody is still steered by are the same drift this requirement exists to stop, and
the archive keeps the text.

#### Scenario: A vision item completes

- **WHEN** a change realizing part of the vision is archived
- **THEN** the vision states the outcome at the passage that claimed it, and no
  status column anywhere in the directory needs editing to stay true

#### Scenario: A reader asks how far along the framework is

- **WHEN** somebody opens a design-fiction directory
- **THEN** it answers with the argument and points at `openspec list` and the
  archive for state, rather than answering from a table

#### Scenario: A vision has nothing left to report

- **WHEN** every item in a design-fiction directory has shipped, completed, been
  withdrawn or reported
- **THEN** its live rules move to the real guides and specs, every withdrawal has
  a postmortem, the directory's live citations are repointed, and it is deleted
  rather than kept as a record
