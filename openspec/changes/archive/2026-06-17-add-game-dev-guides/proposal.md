# Proposal: Codify the game-port and hint-authoring playbooks as dev guides

**Status**: Proposed

## Why

The project is 14 games into a ~40-game migration with the port pattern now
stable (Flip → Galaxies → … → Range) and the hint system matured across three
exemplars (Sixteen, Palisade, Range). The procedural knowledge for "how do I
port a game" and "how do I write a hint" exists — but it is **changelog-shaped
and dispersed**: spread across `AGENTS.md` sections, 25 archived changes, the
per-game specs, and memory. A new porter (the owner weeks later, or an agent)
has to reverse-engineer the procedure from the Galaxies archive plus four
`AGENTS.md` sections plus the long-tail-risks list. With ~25 games left the
leverage of writing the procedure down once is high; doing it now (rather than
earlier) is right because the pattern is finally stable enough to generalize
honestly.

## What Changes

- **New `docs/porting/` directory with two link-heavy dev guides.**
  - `game-port-playbook.md` — the ordered procedure for porting a game: how to
    pick the next one (and the long-tail-risk checklist to consult *first*),
    the `index/state/solver/generator/render` file layout, idiomatic-TS rules,
    the `Int32Array` packed-cache-key pattern, the two-stage parity gate
    (register → owner-accept → flip `TS_PORTED` + delete `.c`), the
    differential-check shape, and the test tiers to write.
  - `hint-authoring.md` — the procedure for adding `hint()` to a ported game:
    the Palisade quality bar, the `HintResult`/`HintStep`/plan mechanics,
    `hintKeepTrack`, `continuesPrevious` journeys, render conventions
    (`COL_HINT`, equivalent-moves-share-a-colour), the refusal → `findMistakes`
    + banner coupling, `AUTO_HINT_STEP_MS` pacing, and the empirical-probe
    method lesson.
- **The guides link to the specs; they never restate requirements.** The
  `ts-migration`, `ts-engine`, and `repo-layout` specs stay the single
  normative source for *what* is required; the guides are the followable
  *how*, pointing at the authoritative requirement and at exemplar files
  (Galaxies port, Palisade/Range hints). This is the one rule that prevents a
  third drifting source of truth.
- **`repo-layout` spec delta.** Sanction `docs/` as a top-level directory and
  add a requirement that developer guides live there and are link-only to
  specs (no duplicated normative content).
- **`AGENTS.md` pointers + a standing "live wiki" directive.** The relevant
  sections (TS port style, Hint quality bar) gain a one-line pointer to the
  corresponding guide. A prominent new section near the top makes consulting
  *and maintaining* the guides a standing instruction: for **any** game work
  (porting, hint, render/input fix, iterating an existing game) read the
  relevant guide first and update it in the same change whenever it falls
  short — that edit is part of "done." The guides are an evolving live wiki,
  not frozen docs.

## Impact

- **Affected specs:** `repo-layout` (MODIFIED: `docs/` is a sanctioned
  top-level dir; ADDED: developer guides live under `docs/` and link to
  specs).
- **Affected code/docs:** new `docs/porting/{game-port-playbook,hint-authoring}.md`;
  one-line pointers added to `AGENTS.md`. No source or test changes.

## Provisional until battle-tested on port #15

A process doc nobody has followed is untrustworthy. This change lands a
**provisional v1**. The guides are not declared "codified" until the next game
port (#15) is executed by literally following the playbook, with every gap or
wrong step fixed in the guide as it surfaces. The change is archived only
after that pass.

## Out of scope

- Rewriting or trimming the `AGENTS.md` prose beyond adding pointers (a larger
  reorganization is its own change if ever wanted).
- A user-facing (in-app `/help`) document — these are developer guides.
- Per-game guides; the two cross-cutting guides cover the shared procedure,
  and game-specific decisions stay in each game's spec + archived change.
