# repo-layout — deltas for settle-the-framework-vision

## ADDED Requirements

### Requirement: A design-fiction doc SHALL NOT carry a hand-maintained status column

A document under `docs/framework-rdd/` SHALL NOT hold a progress table, readiness
column, or any other per-item status the repository maintains by hand. An item's
outcome SHALL be stated at the claim it corrects, and "what remains" SHALL resolve
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

**A withdrawn or completed item SHALL be struck through and kept with its
argument**, never deleted. The withdrawals of the gesture table, the board model
and the definition adapter are the most reused prose in the directory precisely
because the reasoning survived the verdict; a deletion would have left the next
session free to re-propose them.

**A vision doc SHALL NOT be the home of a rule that has become live.** When a
passage becomes true, the rule moves to `AGENTS.md`, a `docs/games/` guide or a
spec, and the vision links to it — because a live rule whose only statement sits
inside a document banner-labeled as fiction cannot be cited by the code that obeys
it.

#### Scenario: A vision item completes

- **WHEN** a change realizing part of the vision is archived
- **THEN** the vision states the outcome at the passage that claimed it, and no
  status column anywhere in the directory needs editing to stay true

#### Scenario: A reader asks how far along the framework is

- **WHEN** somebody opens `docs/framework-rdd/`
- **THEN** the directory answers with the argument and points at `openspec list`
  and the archive for state, rather than answering from a table
