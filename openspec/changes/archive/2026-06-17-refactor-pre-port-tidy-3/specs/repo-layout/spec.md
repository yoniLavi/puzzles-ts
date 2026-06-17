## ADDED Requirements

### Requirement: A scaffolding script stamps out a new game-port skeleton

The repository SHALL provide `scripts/new-game-port.sh <gameId>` that creates the
mechanical skeleton of a new port: `src/native/games/<gameId>/` containing typed
`Game<…>` stub modules (the `index`/`state`/`solver`/`generator`/`render`
file shape the game-port playbook prescribes) and an empty `__fixtures__/`
placeholder. The script SHALL refuse to overwrite an existing game directory. It
SHALL print — but SHALL NOT itself perform — the manual-edit checklist that
requires judgement: writing the `<gameId>-trace.c` harness, registering the game
in `src/native/games/ts-ported-ids.ts` and `src/native/games/index.ts`, and
adding the two committed icon PNGs. `docs/porting/game-port-playbook.md` SHALL
reference the script as the copy-from-exemplar entry point.

#### Scenario: Scaffolding a new port

- **WHEN** a contributor runs `scripts/new-game-port.sh singles`
- **THEN** `src/native/games/singles/` is created with the typed stub modules and
  an empty `__fixtures__/`
- **AND** the script prints the manual-edit checklist (trace harness, the two
  registration files, the icon PNGs) without editing those files

#### Scenario: Refusing to clobber an existing port

- **WHEN** the target `src/native/games/<gameId>/` already exists
- **THEN** the script exits non-zero without modifying the existing directory
