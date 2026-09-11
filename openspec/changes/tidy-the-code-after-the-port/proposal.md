## Why

The games were ported from C under a byte-parity discipline that has since been
retired, and the code still reads like a port: comments justifying constraints
that no longer bind, terse names where a reader has to stop and ask what they
stand for, and function shapes inherited from the C. Every future game is
written by reading these files, so their style is the collection's real
template, and nobody has made a pass over it at that level since the port.

Measured 2026-09-10, non-test source only: 176k lines, of which the games are
135k at 18% comment lines and the engine 22k at 37%. Across both, 519 lines
refer to upstream or the C, 115 read "used to", "no longer" or "previously",
and 792 functions exceed a cognitive complexity of 15. Sampling says most
comments are good *why* comments; the debt is concentrated in rationale that
outlived the port, not in restatement of the code.

## What Changes

- A pass over every game, then over the engine, that:
  - removes comments that restate the code, annotate a past diff, or justify a
    constraint that no longer binds, and shortens the ones that stay;
  - renames an identifier only where a reader had to ask what it stands for and
    the context did not answer;
  - simplifies code where a shorter form is also a simpler one, and deletes
    dead code.
- The net line count goes down. The pass adds no new abstraction; an
  extraction it notices is recorded, not made here.
- No behavior changes. Generated boards, rendered frames, save formats and game
  IDs are all unchanged, and the frozen differentials and render snapshots are
  what prove it.
- The reading test behind the pass is stated once as a repo-layout requirement,
  and the mechanics guide points at it, so a new game is written to it from the
  start.

The detail of what each game's pass does is deliberately left to the
implementation. The rubric is a reading test, not a checklist.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repo-layout`: adds a requirement stating when a comment earns its place and
  when a name should change.

## Impact

- Every file under `src/games/` and `src/engine/`, excluding the frozen fixture
  data. Test files are in scope where the same issues appear, verified by test
  count as the existing comment-sweep scenario requires.
- `docs/games/` guides that cite a renamed function are repointed in the same
  commit.
- The local-feedback probe anchors on engine source lines, so engine edits
  re-anchor it; the gate's `--verify` step enforces this.
- No player-visible change, no data compatibility change, no dependency change.
