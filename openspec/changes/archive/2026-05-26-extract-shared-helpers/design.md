## Context
Two shipped ports (Flip, Galaxies) each re-declare button codes and implement `mkhighlightBackground` locally. The `Dsf` class lives in `galaxies/dsf.ts` but is needed by Loopy/Slant/Tents/Magnets. The post-Galaxies evaluation identified these three extractions as the prep work before port #3.

## Goals / Non-Goals
- Goals: Centralise the three helpers so future ports import them from `src/native/engine/`. Update Flip and Galaxies to use the shared versions. Delete the local `galaxies/dsf.ts`.
- Non-Goals: No `PointerSession` state machine yet — that's a follow-up once we have a second drag-and-hold game (Loopy/Net). This change just centralises the button constants. No midend or Game interface changes. No new game port.

## Decisions

### D1: `colour-mkhighlight.ts` — function, not class
The C `game_mkhighlight_specific` produces 3–5 colours (background, highlight, lowlight, + optional 2 more). Galaxies only needs the adjusted background. The shared helper exports one function: `mkhighlightBackground(bg: Colour): Colour`. Future games that need highlight/lowlight can add `mkhighlightPalette` later — YAGNI until a second consumer appears.

### D2: `pointer.ts` — plain consts + type-safe categorisation
Button codes are exported as plain `const` values (not an enum) so advisory diff scripts can still run under Node's strip-only TS loader. A `PointerAction` discriminated union type categorises the raw button number into `{type: "press", button: "left"|"middle"|"right"}` | `{type: "drag", button: ...}` | `{type: "release", button: ...}` | `{type: "cursor", direction: ...}`. Games destructure on `action.type` instead of switching on magic numbers. The `parsePointerAction(button: number): PointerAction` function does the categorisation.

### D3: `dsf.ts` — verbatim promotion
The Galaxies `Dsf` class moves to `src/native/engine/dsf.ts` unchanged. Galaxies' `dsf.ts` is deleted; its import path changes. No API additions until a second consumer needs them.

### D4: Flip doesn't use mkhighlightBackground
Flip has no white/black tile regions — it doesn't call `mkhighlightBackground`. The extraction only updates Galaxies' import. Flip only picks up the shared button constants.

## Risks / Trade-offs
- **Risk**: `PointerAction` categorisation may not match every game's button semantics. **Mitigation**: Games can still compare against the raw button constants for edge cases; `PointerAction` is a convenience, not a constraint.
- **Risk**: Promoting `Dsf` now (before a second consumer) slightly violates the "second consumer" rule. **Mitigation**: The promotion itself *is* the second-consumer event — the engine-level file is the shared location; the next dsf-using game imports from there.

## Open Questions
- None. The three extractions are well-scoped from the post-Galaxies evaluation.
