# ts-engine spec delta

## ADDED Requirements

### Requirement: executeHint supports a single-step (hide-after) mode

`midend.executeHint(hideAfter?)` SHALL accept an optional `hideAfter` flag
(default false, threaded through `PuzzleEngineSurface` and the worker adapter).
When false the behaviour is unchanged — the executed step stays displayed
through its animation and, on settle, the plan advances and the next step is
**displayed as the auto-play preview**. When `hideAfter` is true the executed
step still stays displayed through its animation, but on settle the plan
advances and is then **hidden** (the same hidden-but-stored state a manual step
completion produces), so nothing is previewed; the next `midend.hint()`
re-displays the advanced step without recomputing. The C/WASM surface accepts
and ignores the flag (it supports no hints).

#### Scenario: Single-step execute hides the plan instead of previewing

- **WHEN** `executeHint(true)` is called on a game with a stored plan
- **THEN** the current step's move is applied and, once it settles, the plan
  advances and is hidden (no next-step preview is displayed)
- **AND** a subsequent `hint()` re-displays the advanced step without
  recomputing the plan

#### Scenario: Auto-play execute still previews the next step

- **WHEN** `executeHint()` (no argument) is called on a game with a stored plan
- **THEN** the executed step settles and the next step is displayed as the
  auto-play preview, exactly as before

### Requirement: The toolbar Hint button alternates show and apply

The app shell's **Hint** control SHALL alternate between showing and applying
one hint step, built on the two midend primitives (`hint()` to display,
`executeHint(true)` to apply one step and hide it), without changing any game's
`hint()`. The intent is one applied hint per request: most players need a single
nudge to get unstuck, so applying is terminal — it does not auto-advance to the
next hint.

The orchestrating `Puzzle` SHALL maintain an "armed to apply" flag that is:

- **set** when a Hint press successfully *displays* a step (the `hint()` show
  path returns no refusal), and
- **cleared** when a Hint press *applies* a step (so the rhythm is
  show → apply → show → apply), and by any intervening user action — a move
  (key or pointer), undo, redo, solve, restart, new game, checkpoint load,
  loading a saved game, deletion, or starting Auto-Hint.

A Hint press SHALL:

- when **not armed**, run the show path (`midend.hint()` via the surface),
  arming the flag only if the show succeeds (a refused hint — mistakes present,
  already solved, nothing deducible — SHALL surface its banner/overlay as today
  and SHALL NOT arm);
- when **armed**, disarm and apply exactly the current step via
  `executeHint(true)` (which hides the plan on settle rather than previewing the
  next step). On success, with the board not yet solved, the hint banner SHALL
  show a transient confirmation ("Hint applied"); on an `executeHint` error the
  message SHALL surface in the banner. The next Hint press then *shows* the next
  step.

The separate Auto-Hint play/pause button is unchanged and remains the way to
animate the whole remaining plan unattended (it uses `executeHint()` with no
`hideAfter`, keeping the continuous preview).

#### Scenario: First press shows, second press applies and stops

- **WHEN** the player presses Hint on a hinted game with no active plan, and
  then presses Hint again without any other interaction
- **THEN** the first press displays the current step (no move is applied) and
  the second press applies that one step in slow motion, hides the plan
  (no next step is previewed), and shows a "Hint applied" confirmation

#### Scenario: Presses alternate show and apply

- **WHEN** the player keeps pressing Hint with no other interaction between
  presses
- **THEN** the presses alternate show, apply, show, apply — each apply lands one
  move and stops, and the following press shows the next step

#### Scenario: An intervening action re-arms the show

- **WHEN** the player presses Hint (showing a step), then performs any other
  action (e.g. a move or undo), then presses Hint again
- **THEN** the next press *shows* the now-relevant step rather than applying a
  stale one (the apply is disarmed by the intervening action)

#### Scenario: A refused hint does not arm the apply

- **WHEN** a Hint press is refused (the game's `hint()` returns an
  unsuccessful result, e.g. the board has mistakes)
- **THEN** the refusal banner/overlay surfaces as before and the next Hint
  press is still on the show path (it does not apply a step)
