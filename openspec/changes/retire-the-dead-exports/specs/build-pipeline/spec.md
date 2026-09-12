## MODIFIED Requirements

### Requirement: Dead exports are measured, and the measurement is a diagnostic until the backlog is cleared
The repository SHALL carry a check reporting every export under `src/` that no
other file imports, and the check SHALL carry vacuity floors on the files it
parsed, the exports it found and the fraction of internal import specifiers it
resolved. **It SHALL run in the gate's fast prefix**, with a ledger naming every
export that is kept despite having no importer, and the ledger SHALL be asserted
exactly equal to the check's findings.

An unused export is invisible to the typechecker, to biome and to every test,
because nothing that runs reads it. A tidy pass found dead accessors, dead
re-exports and dead constants across the games entirely by hand.

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

#### Scenario: an export is kept although nothing imports it

- **WHEN** an export is reached from outside the TypeScript graph — a Lit
  component class named by tag in a template, say
- **THEN** it is carried in the check's ledger with that reason
- **AND** an entry that stops being needed fails the gate as loudly as a new
  dead export
