## ADDED Requirements

### Requirement: A shared helper carries the byte-for-byte differential shape

The engine testing utilities SHALL provide `describeDescDifferential` in
`src/native/engine/testing/differential.ts`: given a fixture list, a `params`
mapper, and a game's `newDesc`, it asserts for each fixture that
`newDesc(params(fixture), randomNew(fixture.seed)).desc` equals the fixture's
recorded C desc (the strongest differential bar — valid only for a faithful
generator over the bit-identical RNG), with an optional `extra` callback for a
follow-on assertion. Games whose gated differential is the byte-for-byte desc shape
SHALL use this helper instead of re-implementing the loop. The solver-agreement
differential shape (decode a C board, run the TS solver, assert the recorded
difficulty) is game-specific and is NOT modelled by this helper.

#### Scenario: A game's byte-match differential uses the helper

- **WHEN** a game's gated differential asserts its `newDesc` reproduces the C desc
  byte-for-byte across a fixture set
- **THEN** it calls `describeDescDifferential` with its fixtures, params mapper, and
  `newDesc`, rather than re-declaring the `describe`/`for`/`it`/`expect` loop

## MODIFIED Requirements

### Requirement: A scaffolding script stamps out a new game-port skeleton

The repository SHALL provide `scripts/new-game-port.sh <gameId>` that creates the
mechanical skeleton of a new port: `src/native/games/<gameId>/` containing typed
`Game<…>` stub modules (the `index`/`state`/`solver`/`generator`/`render`
file shape the game-port playbook prescribes), an empty `__fixtures__/`
placeholder, AND starter test scaffolding — a `<gameId>.test.ts` (a
serialise/deserialise round-trip skeleton plus a `renderScenario` smoke skeleton
importing from `src/native/engine/testing/`) and a **commented**
`<gameId>-differential.test.ts` stub referencing `describeDescDifferential` and the
fixture-regenerate recipe (commented so a fresh scaffold type-checks before any
fixture exists). The script SHALL refuse to overwrite an existing game directory.
It SHALL print — but SHALL NOT itself perform — the manual-edit checklist that
requires judgement: writing the `<gameId>-trace.c` harness, registering the game
in `src/native/games/ts-ported-ids.ts` and `src/native/games/index.ts`, and adding
the two committed icon PNGs. `docs/porting/game-port-playbook.md` SHALL reference
the script as the copy-from-exemplar entry point.

#### Scenario: Scaffolding a new port

- **WHEN** a contributor runs `scripts/new-game-port.sh singles`
- **THEN** `src/native/games/singles/` is created with the typed stub modules, an
  empty `__fixtures__/`, a starter `singles.test.ts`, and a commented
  `singles-differential.test.ts` stub
- **AND** the emitted files type-check and lint clean
- **AND** the script prints the manual-edit checklist (trace harness, the two
  registration files, the icon PNGs) without editing those files

#### Scenario: Refusing to clobber an existing port

- **WHEN** the target `src/native/games/<gameId>/` already exists
- **THEN** the script exits non-zero without modifying the existing directory
