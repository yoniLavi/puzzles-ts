## ADDED Requirements

### Requirement: Non-blocking confirmations use a transient toast

The quick-save flow's success confirmations SHALL be shown as a transient
toast, not a modal. This covers a clean board being checkpointed and a
successful Quick-load: each SHALL be a non-modal notification that
auto-dismisses after a few seconds, is manually dismissible, and is
announced to assistive technology (`aria-live="polite"`), and SHALL NOT
require the user to dismiss a modal.

The mistakes-found outcome of Check-&-Save (the save was refused) SHALL
remain a modal alert, because it must interrupt: it reports that no
checkpoint was written and the offending cells are highlighted.

#### Scenario: A clean checkpoint confirms without interrupting

- **WHEN** Check-&-Save (or Cmd/Ctrl+S) saves a clean board
- **THEN** a transient toast confirms the checkpoint and auto-dismisses,
  without blocking further input

#### Scenario: A refused save still interrupts

- **WHEN** Check-&-Save finds mistakes and refuses to save
- **THEN** a modal alert reports the count and that nothing was saved
