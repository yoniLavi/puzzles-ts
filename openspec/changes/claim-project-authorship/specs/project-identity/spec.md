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

### Requirement: Player-facing text is this project's own, and the lineage is credited in one place

Every sentence a player reads outside the per-game help pages — the front
page, the page titles and descriptions, the help site's own pages, the
unsupported-browser and not-found pages, the privacy notes — SHALL be this
project's own writing, in its own voice. Text inherited from `puzzles-web`
SHALL NOT survive verbatim on those surfaces. The per-game pages under
`help/games/` are excluded on purpose: they keep upstream's wording, which the
`help` convention already governs.

The header and the page titles SHALL describe the product (a tagline from
`src/project-identity.ts`) and SHALL name no other project. The lineage is
credited in the About dialog and in the help pages that explain the
collection's origin, where a credit belongs; a header that names a predecessor
presents the app as that predecessor's.

The logo SHALL be this project's own drawing, held in `public/favicon.svg`
(the single source of every generated PWA icon), and the app SHALL ship no
third-party logo. Icons that depict a browser's own controls in the install
instructions are drawn from an openly licensed icon set and are not logos.

#### Scenario: The header speaks for the product

- **WHEN** a player reads the front page header or a page title
- **THEN** it shows the product name and the tagline
- **AND** it names no other project or person

#### Scenario: Inherited copy is gone

- **WHEN** the front page, the help site's own pages, the unsupported-browser
  page and the not-found page are compared with `puzzles-web`'s
- **THEN** no paragraph is shared verbatim

### Requirement: The privacy notes describe what the app does with a player's data

The About dialog's Privacy panel SHALL state, truthfully for the build a player
is using, that the app collects and stores no personal information; that games,
saves, checkpoints and preferences live in the player's own browser storage and
are never sent anywhere; that any usage measurement the app may perform counts
anonymous aggregate actions only, with no personal information and no cookies
or other client-side identifier; and that crash reporting, where a build has it
switched on, sends the error and the app, browser and screen it happened on,
with personal information disabled in the reporting.

The notes SHALL NOT be a development placeholder, and SHALL NOT promise more
than the code keeps: the crash-report description is bound to `sendDefaultPii:
false` in `src/utils/sentry.ts`, and the measurement description is bound to
whatever analytics block a deployment injects — a deployment that adds
identifying measurement MUST change the notes in the same change.

#### Scenario: A player reads the privacy notes

- **WHEN** a player opens the About dialog's Privacy panel
- **THEN** it says no personal information is collected or stored
- **AND** it says their games and settings stay on their device
- **AND** it says any measurement is anonymous and aggregate, with no cookies
  or client-side identifier
- **AND** it describes crash reports as carrying no identity or game data

### Requirement: The app presents its own authorship and its lineage in order

The player-facing surfaces SHALL present this project as its own work,
**maintained by** Yoni Lavi — never "by", which would claim the puzzles
themselves, and those are other people's designs — and SHALL name the lineage
it stands on in chronological order:
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
- **THEN** the project is presented as maintained by Yoni Lavi
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
