# licensing Specification Delta — derive-dependency-attribution

## ADDED Requirements

### Requirement: The About box credits every bundled package, and never a template

The third-party section of the About dialog SHALL name, for each package the
app bundles, who publishes it and under what license, and SHALL reproduce that
package's own notice. **No entry may contain an unfilled license template.**

Apache-2.0's text ends with an appendix headed "How to apply the Apache License
to your work" — a template *for authors*, containing the line
`Copyright [yyyy] [name of copyright owner]`. Where a package fills it in it is
the closest thing that package has to a NOTICE and SHALL be used as one. Where a
package ships it **unfilled**, it names nobody, and the appendix SHALL be
removed rather than reproduced: it is not part of the license grant, and the
alternative is telling players `Copyright [yyyy] [name of copyright owner]`,
which reads as this project's own unfinished work.

Attribution SHALL be **derived from each package's own metadata** — its `author`,
else its `contributors`, else the repository it is published from — and SHALL
NOT be written down in this repository, which would be a list to maintain per
dependency and a claim about someone else's code.

It SHALL be presented as *who publishes the package*, never as a copyright
notice this project asserts on their behalf. Where a package states a copyright
holder, that statement is in the notice text below it and speaks for itself.

A package's own `NOTICE` file SHALL take precedence over everything else, which
Apache-2.0 §4(d) requires.

#### Scenario: A package ships the Apache appendix unfilled

- **WHEN** a bundled package's license text contains the appendix with its
  copyright line left as the template
- **THEN** the appendix is not reproduced, in the extracted form or within the
  license text it would otherwise fall back to
- **AND** the entry still reproduces the license grant itself

#### Scenario: A package fills the appendix in

- **WHEN** a bundled package's appendix names a real copyright holder
- **THEN** that line is used as the package's notice

#### Scenario: A package names nobody

- **WHEN** a package declares no author, no contributors and no repository
- **AND** its notice contains no copyright line
- **THEN** the build fails, rather than shipping an uncredited package

#### Scenario: The check cannot pass over an empty list

- **WHEN** the bundled-package listing is implausibly short
- **THEN** the build fails on the count rather than reporting that every entry
  is fine
