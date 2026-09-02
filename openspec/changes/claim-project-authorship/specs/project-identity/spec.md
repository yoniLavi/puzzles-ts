# project-identity Specification Delta — claim-project-authorship

## ADDED Requirements

### Requirement: The product is named Hintful Puzzles, from one source

The product SHALL be presented to players as **Hintful Puzzles**, with the
short label **Hintful** where a full name does not fit (the label under an
installed icon). The repository remains `puzzles-ts`: the product and the
codebase are different things with different names, and only the product name
reaches a player.

The name and the support links SHALL have one source in the code
(`src/project-identity.ts`), read by every surface that shows them — the About
dialog, the PWA manifest, the front page's title and heading, and the home
screen's header — so that a rename is one edit and the copies cannot drift.

#### Scenario: Every surface shows the same name

- **WHEN** a player reads the front page heading, installs the app, or opens
  the About dialog
- **THEN** each shows "Hintful Puzzles" (the installed icon may show "Hintful")
- **AND** none of them carries its own copy of the string

#### Scenario: A deployment may brand itself without changing the project

- **WHEN** a deployment sets `VITE_APP_NAME`
- **THEN** the dialog title and the manifest show that name
- **AND** the license panel still labels the MIT notice with the project name

### Requirement: The app presents its own authorship and its lineage in order

The player-facing surfaces SHALL present this project as its own work, authored
by Yoni Lavi, and SHALL name the lineage it stands on in chronological order:
Simon Tatham's Portable Puzzle Collection, Lennard Sprong's `puzzles-unreleased`
additions, Mike Edmunds' `puzzles-web` PWA shell, then this project.

Mike Edmunds SHALL be credited explicitly as the author of `puzzles-web`, the
direct parent this project forked from. Claiming authorship of this version is
not a reason to state a predecessor's contribution less clearly than before —
this requirement adds a name to the front of the chain and removes none from the
middle of it.

The description SHALL say what this version is. It is a **native TypeScript
implementation** of the collection on this project's own engine, not a web
adaptation of a C engine compiled to WebAssembly — the latter describes
`puzzles-web` and stopped being true of this project at `retire-c-engine`.

No player-facing text SHALL speak in a first person whose referent is not the
current author. Prose inherited from a predecessor SHALL be re-attributed to
them by name or rewritten without the pronoun; an unowned "I" silently
reassigns a personal statement to whoever holds the repository next.

#### Scenario: The About dialog names the author and the lineage

- **WHEN** a player opens the About dialog
- **THEN** the project is presented as authored by Yoni Lavi
- **AND** Simon Tatham, Lennard Sprong and Mike Edmunds are each credited, with
  Mike Edmunds identified as the author of `puzzles-web`
- **AND** no first-person statement is attributed to nobody

#### Scenario: The description matches what the app actually is

- **WHEN** the About dialog describes this version
- **THEN** it describes a native TypeScript implementation
- **AND** it does not describe the app as a WebAssembly adaptation

### Requirement: Player-facing links resolve to this project

Every player-facing link SHALL resolve to a destination this project controls,
or SHALL be absent — this covers the links offered for source code, discussion,
bug reports and credits. A link SHALL NOT direct a player to a predecessor's
repository for support with code that predecessor did not write.

This covers the About dialog's source / forum / bug-report links, the front-page
footer's credits link, and the fallback link shown to unsupported browsers.

Links that exist to **credit** a predecessor or upstream — pointing at
`puzzles-web`, at Simon Tatham's site, or at `puzzles-unreleased` — are not
support destinations and SHALL be kept. The distinction is what the link is
*for*: attribution points outward by design, support must point home.

#### Scenario: A bug report is not misrouted

- **WHEN** a player follows the app's bug-report or discussion link
- **THEN** the destination belongs to this project
- **AND** it is not a predecessor's issue tracker

#### Scenario: Attribution links are preserved

- **WHEN** the About dialog credits upstream, `puzzles-unreleased` or
  `puzzles-web`
- **THEN** those links still point at those projects
