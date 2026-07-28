# ts-engine Specification Delta — fix-worker-repaint-nonsquare

> **NOT APPLIED.** This change was withdrawn 2026-07-28 as not reproducible and
> archived with `openspec archive --skip-specs`. This delta was **never merged
> into `openspec/specs/ts-engine/spec.md`** — it is retained only as a record of
> what was proposed. Do not cite it as a live requirement.
>
> Why it was not applied: the requirement below asserts "the first frame is
> painted", which three diagnosis passes showed **already holds** — the worker's
> offscreen bitmap was fully painted in every configuration tested. Adopting it
> would have specced an invariant nothing violates, while implying a fix had
> landed that never did. If the symptom ever resurfaces, `FINDINGS.md` argues the
> requirement would need reframing around "the first frame reaches the *screen*",
> which is a different guarantee at a different seam.

## ADDED Requirements

### Requirement: The first frame paints regardless of palette and resize ordering

The worker adapter SHALL guarantee that the first frame of a newly-started game
reaches the canvas, whatever the order in which the initial `redraw` request,
the palette install, and the canvas resize/clear arrive. A repaint requested
before the palette is installed MAY be dropped by the palette gate, but the
adapter SHALL re-issue a paint once the palette is available; and a resize or
canvas-clear that drops the drawstate SHALL NOT be the last operation to touch
the canvas without a subsequent paint. This SHALL hold for boards whose aspect
ratio differs from the layout slot (which receive an additional resize after the
first paint) exactly as for square boards.

The guarantee SHALL be met without the engine emitting pixels of its own: the
adapter schedules a *game* repaint (via `redraw` / `forceRedraw`), and
`Midend.size` remains informational. A game reached by a direct link SHALL paint
on first load identically to the same game reached through the in-app menu.

#### Scenario: A fast-generating game reached by direct link paints on first load

- **WHEN** a game is opened by a direct link whose board generates quickly, so
  the initial repaint is requested before the palette is installed
- **THEN** the board is painted once the palette is available
- **AND** the canvas is not left blank pending an unrelated later event

#### Scenario: A non-square board paints on first load

- **WHEN** a board whose width and height differ is opened by a direct link, so
  it receives a resize after the app's first paint
- **THEN** the board is painted and the canvas is not left blank
- **AND** it paints identically whether reached by direct link or via the menu

#### Scenario: The guarantee adds no framework-emitted pixels

- **WHEN** the first-frame guarantee causes a paint
- **THEN** the paint originates from `game.redraw`, not from a framework
  background fill or clear
- **AND** `Midend.size` remains purely informational
