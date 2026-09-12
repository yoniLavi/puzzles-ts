## RENAMED Requirements

- FROM: `### Requirement: Dead exports are measured, and the measurement is a diagnostic until the backlog is cleared`
- TO: `### Requirement: Nothing exports a symbol no other file imports`

## MODIFIED Requirements

### Requirement: Nothing exports a symbol no other file imports
The repository SHALL carry a check reporting every export under `src/`,
`vite-plugins/` and `scripts/` that no other file imports, and the check SHALL
carry vacuity floors on the files it parsed, the exports it found and the
fraction of internal import specifiers it resolved. **It SHALL run in the gate's
fast prefix**, with a ledger naming every export that is kept despite having no
importer, and the ledger SHALL be asserted exactly equal to the check's
findings — so an entry that stops earning its place fails as loudly as a new
dead export, and an empty ledger is itself a claim.

An unused export is invisible to the typechecker, to biome and to every test,
because nothing that runs reads it. A tidy pass found dead accessors, dead
re-exports and dead constants across the games entirely by hand.

**What counts as a use is a rule each time, never a list.** A named or namespace
import, a re-export, an entry file, a glob whose modules are really imported —
and **a name mentioned in the signature of another export that is itself
reached**, because a caller writing the object literal an exported function
takes is reaching that type whether or not it imports the name. That last one is
163 of the 376 findings the backlog held, all of them types; without it the only
options are to un-export a type an exported signature names, which makes it
unnameable by the caller who has to satisfy it, or to write a 163-entry ledger,
which is the skip list this check exists not to be. It is resolved to a fixpoint
*after* the dead set is known and only from an owner something reaches, so a
dead exported function cannot keep its own options type alive.

**The check is written here rather than installed, on a measurement.** `knip` was
a devDependency for exactly this job, wired to no script. Measured 2026-09-12 at
the pinned 6.31.0, with a config naming this repository's real entry points, it
reports zero unused exports — and asked to trace a symbol imported on the first
line of `src/main.ts`, it answers that no such export exists. The cause is
structural: this repository writes every import with a `.ts` specifier, and
knip's resolver does not follow those, so its module graph stops at each entry
file. Its zero was a scan of nothing. The dependency is removed rather than
worked around, so the next reader does not repeat the investigation.

#### Scenario: an export loses its last importer

- **WHEN** the only import of an exported symbol is deleted
- **THEN** the gate fails, naming the symbol and its file
- **AND** deleting the export, or importing it again, makes the gate pass

#### Scenario: a relay is counted as a consumer

- **WHEN** a module is reached only through `export * from` a barrel, or through
  an `import.meta.glob` that reads it as text with `?raw`
- **THEN** its exports are NOT thereby counted as used, because neither is a use
- **AND** the check's report is verified against a deliberately planted dead
  export, since both of those blind spots are silent rather than wrong

#### Scenario: the resolver stops following this tree's imports

- **WHEN** a change makes internal `.ts` specifiers stop resolving
- **THEN** the floor on the resolved fraction fails, rather than the check
  reporting a clean tree
- **AND** the floor counts only specifiers the check was asked to resolve, since
  counting package imports as unresolved makes the floor read a failure that is
  not one

#### Scenario: a type is named only by the signature that takes it

- **WHEN** an exported type is named by an exported function's parameter and
  nothing imports the type
- **THEN** it is NOT reported, because the caller reaches it through the
  function
- **AND** a type no reached export names IS reported, which is what the planted
  dead `interface` proves
