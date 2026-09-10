## ADDED Requirements

### Requirement: A Hint press in flight is dropped, and a slow one says it is thinking

While a Hint press is being answered by the worker, a further press SHALL be
dropped — not queued. Nothing else in the app queues behind a hint either:
the show/apply rhythm of "The toolbar Hint button alternates show and apply"
SHALL be exactly as it would be had the dropped presses never happened, in
both beats (during a *show* nothing is armed yet; during an *apply* the step
was disarmed on the way in).

A show whose answer lands after Auto-Hint has been started SHALL NOT arm the
apply behind it: Auto-Hint owns the plan from the moment it starts.

A press unanswered after a short delay (`HINT_PENDING_MS`, 300 ms) SHALL be
visible as work in progress: the Hint control's label and the hint banner
SHALL both say "Thinking…" until the answer lands. The delay exists so an
ordinary hint never flickers. When the answer lands, the label reverts to the
beat the next press will take, and the banner shows the answer's own message
(a refusal, "Hint applied") or is cleared if the show succeeded.

A slow hint is deliberately **not cancellable**: the search runs synchronously
inside the worker, so an interrupt would need every game's search to poll a
flag, and the longest case is a few seconds once or twice a game. Making the
wait legible is the whole remedy.

#### Scenario: Presses during a slow hint are dropped, and the rhythm survives

- **WHEN** the player presses Hint three times while the first press is still
  being answered
- **THEN** exactly one request reaches the worker, and the press after it
  lands applies the step that press showed

#### Scenario: A slow hint is labeled

- **WHEN** a Hint press has gone unanswered for `HINT_PENDING_MS`
- **THEN** the Hint control reads "Thinking…" and the banner says the same,
  and both revert when the answer lands

#### Scenario: A fast hint is never labeled

- **WHEN** a Hint press is answered within `HINT_PENDING_MS`
- **THEN** neither the control nor the banner ever says "Thinking…"

#### Scenario: A late answer's own message wins

- **WHEN** a hint that was labeled "Thinking…" lands as a refusal
- **THEN** the banner shows the refusal, not an empty banner
