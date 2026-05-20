# ts-engine spec delta

This delta adds a *proposed* capability — `Game.scene()` — to the
`ts-engine` spec. It is intentionally minimal here; the
implementation change (`add-scene-graph-reconciler`, separate) will
refine it once the reconciler and pilot game are designed concretely.
This change exists to record the direction so design review can
happen as a unit, not piecemeal during implementation.

## ADDED Requirements

### Requirement: Games MAY describe their canvas via a pure scene-graph function

The `Game` interface SHALL support an optional `scene(s, ui,
animTime, flashTime, prev?, dir?): Scene` method. When a game
defines `scene`, the midend SHALL prefer it over the imperative
`redraw` method: it SHALL invoke `scene` to obtain an immutable
scene description and SHALL delegate the canvas writes to a
framework-owned reconciler that compares the new scene against the
previous frame's scene (matched by stable node `id`) and emits only
the draw operations needed to update changed nodes.

The scene description SHALL be a list of nodes drawn in order. Each
node SHALL carry a stable `id` (game-chosen) so the reconciler can
match nodes across frames. The primitive set SHALL cover the cases
the existing imperative `GameDrawing` covers — filled rectangle,
line, polygon, circle, text, and a `group` with optional clip and
transform that contains child nodes. The exact node-type
definitions and reconciler semantics SHALL be specified in the
implementation change.

Games that do not define `scene` SHALL continue to use `redraw`
unchanged. The midend SHALL NOT require games to migrate; the
imperative `redraw` and the declarative `scene` SHALL coexist for
as long as any shipped port uses `redraw`.

#### Scenario: A game defining `scene` is reconciled by the framework

- **WHEN** a registered TS game implements `scene` (and not `redraw`)
- **THEN** the midend invokes `game.scene(s, ui, animTime, ...)` to
  obtain the frame's scene description
- **AND** the framework-owned reconciler emits the minimum canvas
  draw operations needed to bring the canvas from the previous
  frame's scene to the new frame's scene
- **AND** the game emits no canvas writes directly

#### Scenario: A game defining `redraw` is unchanged

- **WHEN** a registered TS game implements `redraw` (and not `scene`)
- **THEN** the midend invokes `game.redraw(dr, ds, ...)` exactly as
  it does today
- **AND** the per-game draw-state cache the imperative path relies
  on continues to work as before

#### Scenario: A game defining both is selected toward `scene`

- **WHEN** a registered TS game implements both `scene` and `redraw`
  (e.g. mid-migration of a complex game)
- **THEN** the midend uses `scene` and the reconciler
- **AND** the `redraw` implementation is treated as dead code (the
  game is free to remove it once `scene` is validated)
