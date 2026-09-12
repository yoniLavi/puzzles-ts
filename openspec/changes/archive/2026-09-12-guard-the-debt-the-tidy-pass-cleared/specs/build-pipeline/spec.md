## ADDED Requirements

### Requirement: Dead exports are measured, and the measurement is a diagnostic until the backlog is cleared
The repository SHALL carry a check reporting every export under `src/` that no
other file imports, and the check SHALL carry vacuity floors on the files it
parsed, the exports it found and the fraction of internal import specifiers it
resolved. It SHALL be a diagnostic rather than a gate step while its report is
larger than a reviewer would read, and moving it into the gate SHALL be the act
that closes the backlog rather than a separate decision.

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
- **THEN** the check reports the symbol and its file
- **AND** deleting the export, or importing it again, removes it from the report

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

### Requirement: A complexity ceiling is set from the tree's own distribution
The cognitive-complexity ceiling SHALL be a number taken from the measured
distribution of this repository, recorded with that measurement, and SHALL NOT be
left at a value no function in the tree can reach.

A rule configured never to fire is indistinguishable from a rule that is off,
except that it reads as enforced. The ceiling in force before this change was
150, and no function reached it.

**Measured 2026-09-12, with biome's diagnostic cap lifted**: 876 diagnostics at
15, 477 at 25, 154 at 50, 71 at 75, 26 at 100, 12 at 120, 6 at 130, 2 at 140, 0
at 150. There is no knee — the tree has a long tail — so the ceiling is chosen
for the size of the exception list it produces, and it is **130**, with six
sites accepted at their sites.

**Why not lower, which is the part worth knowing.** The 26 sites at 100 are not
a scattered tail: every one is an `interpretMove`, a `redraw`, or a solver's
deduction loop — the three functions a game port inherently carries, branchy
because the puzzle is. A ceiling that names 26 instances of a known, inherent
shape is a ceiling that gets suppressed 26 times and then ignored.

#### Scenario: a new function exceeds the ceiling

- **WHEN** a function is added whose cognitive complexity is above the ceiling
- **THEN** the gate fails, and the author either simplifies it or records at the
  site why the shape is inherent

#### Scenario: an existing site is accepted rather than simplified

- **WHEN** a site named by the rule is an input arbitrator, a redraw diff or a
  deduction loop whose branching is inherent
- **THEN** it may stay, with a comment at the site stating the reason it is that
  shape
- **AND** the comment states the constraint, not the history of the decision
