# Change: Transient toast for quick-save confirmation

## Why

Check-&-Save / Quick-save currently confirms success with a modal
`showAlert` ("Checkpoint saved") that must be dismissed. For a *quick*
action — especially the Cmd/Ctrl+S path one might press often — a modal
that interrupts and demands a click defeats the point. A transient,
auto-dismissing toast is the right feedback for a non-blocking success.
The mistakes-found case stays a modal (it *should* interrupt: it is
telling you the save was refused).

## What Changes

- Add a lightweight transient toast (auto-dismiss after a few seconds,
  dismissible, non-modal) — a small Lit component or a thin wrapper over a
  Web Awesome callout — surfaced through a `showToast(...)` helper
  alongside the existing `showAlert(...)`.
- Quick-save **success** ("Checkpoint saved") and **Quick-load** success
  use the toast; the **mistakes-found** refusal keeps the modal warning.
- Toasts stack/replace sanely and are screen-reader announced
  (`aria-live="polite"`).

## Impact

- Affected specs: `quick-save` (MODIFY the Check-&-Save requirement's
  feedback wording: success → transient toast, refusal → modal).
- Affected code: a new toast component/helper (e.g.
  `src/dialogs/toast.ts`), `src/screens/puzzle-screen.ts` (success/load
  paths call `showToast`).
- No new heavyweight dependency (reuse Web Awesome primitives or a ~40-line
  component).
