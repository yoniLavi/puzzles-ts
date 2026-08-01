# repo-layout Specification Delta — retire-c-engine

## MODIFIED Requirements

### Requirement: A scaffolding script stamps out a new game-port skeleton

The repository SHALL provide `scripts/new-game-port.sh <gameId>` that creates the
mechanical skeleton of a new game: `src/native/games/<gameId>/` containing typed
`Game<…>` stub modules (the `index`/`state`/`solver`/`generator`/`render`
file shape the game-port playbook prescribes), an empty `__fixtures__/`
placeholder, AND starter test scaffolding — a `<gameId>.test.ts` (a
serialise/deserialise round-trip skeleton plus a `renderScenario` smoke skeleton
importing from `src/native/engine/testing/`) and a `<gameId>-generation.test.ts`
stub for the generation invariants that stand in for the retired byte-match
oracle. The script SHALL refuse to overwrite an existing game directory.

It SHALL print — but SHALL NOT itself perform — the manual-edit checklist that
requires judgement: registering the game in `src/native/games/index.ts`, adding
its catalog entry to `src/puzzle/catalog-data.ts`, stating what the generation
test asserts, and adding the two committed icon PNGs.
`docs/porting/game-port-playbook.md` SHALL reference the script as the
copy-from-exemplar entry point.

The scaffold SHALL NOT emit a C-differential stub or instruct a contributor to
write a `<gameId>-trace.c` harness: `retire-c-engine` deleted the C build, so a
new game has no upstream oracle to record a fixture against. The existing frozen
fixtures belong to games ported while that build existed and are unaffected.

#### Scenario: Scaffolding a new game

- **WHEN** a contributor runs `scripts/new-game-port.sh singles`
- **THEN** `src/native/games/singles/` is created with the typed stub modules, an
  empty `__fixtures__/`, a starter `singles.test.ts`, and a
  `singles-generation.test.ts` stub
- **AND** the emitted files type-check and lint clean
- **AND** the script prints the manual-edit checklist (the two registration
  points, the generation invariants, the icon PNGs) without editing those files

#### Scenario: The scaffold does not promise an oracle that no longer exists

- **WHEN** the scaffold is generated
- **THEN** it contains no C-differential stub and no trace-harness instruction
- **AND** the generation-test stub states that the game's assurance is
  behavioural
