# Proposal: Fix Latin-family hidden-single hint narration

**Status**: Proposed

## Why

The shared `latin.ts` solver records *every* forced single placement (its generic
`elim`) under one reason, `{ kind: "single" }`. But `elim` fires on three slice
kinds: a *cell* slice (a genuine **naked** single — the cell's own candidates
collapsed to one), and a *row* / *column* slice (a **hidden** single — a digit that
fits only one cell of that line, while the cell itself still shows several
candidates). Every Latin-family hint (Towers, Unequal, Keen) narrated all of them as
naked singles — "every other number/height has been ruled out in this cell" — which
is **false for a hidden single**: the player is looking at a cell that visibly still
holds several candidates.

The owner caught this on Keen (a cell showing 1, 2, 3, 4 told "it can only be 3"),
fixed there in `add-keen-hint`. A probe then confirmed the same latent bug in the two
older Latin ports: **37/96 Towers** and **13/82 Unequal** placements were
mis-narrated. The owner asked to fix it in those games too. This change hoists the
Keen fix into a shared helper and applies it to all three.

## What Changes

- **New shared helper `src/native/engine/latin-hint.ts`**: `classifyPlacement`
  re-derives a forced placement's kind from the working board — **naked** (notes are
  exactly `{n}`), **hidden** (no other *empty* cell of a row/column still has `n`), or
  **forced** (neither — the notes lag behind a deeper set/forcing deduction).
  `singlePlacementReason` maps those to the `single` / `hiddenSingle` / `forcedSingle`
  reasons; `hiddenSingleLine` returns the line's cells for evidence shading.
- **Keen** refactored onto the shared helper (its inline classifier removed); gains
  a `forcedSingle` reason + honest narration for the residual case.
- **Towers and Unequal** each gain a `hiddenSingle` + `forcedSingle` reason, the two
  narrations, line-of-sight evidence shading for a hidden single, and reclassification
  of a recorded `single` placement at their `nextPlace` site (Towers reclassifies
  **only** `single` — its clue-driven placements keep their own reasons).
- **Tests**: `latin-hint.test.ts` (the classifier's three cases + the filled-competitor
  edge); a cross-game regression guard in `hint-resume.test.ts` ("a Latin-family
  placement never falsely claims a naked single") covering Towers, Unequal and Keen.

## Impact

- **Affected specs:** `ts-engine` (ADDED a cross-game Hint System requirement — the
  naked/hidden/forced single distinction). No per-game spec change; the games' hint
  requirements already mandate truthful, quality-bar narration, which this enforces.
- **Affected code:** `src/native/engine/latin-hint.ts` (new) + its test; the hint
  paths of `keen`, `towers`, `unequal`; `hint-resume.test.ts`. The generator/solve
  paths are untouched (this is hint-display-only).
- Bugfix to two owner-accepted games (Towers, Unequal) at the owner's explicit
  request, plus a refactor of the just-shipped Keen fix onto the shared helper.

## Out of scope

- **Tightening the working notes before a placement** (surfacing every set/forcing
  elimination as a strike so a `forced` single becomes a clean naked/hidden one) — a
  larger plan-builder change; here the residual `forced` case is narrated honestly
  instead.
