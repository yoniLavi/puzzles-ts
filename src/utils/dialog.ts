/**
 * Light-dismiss for a native modal `<dialog>`.
 *
 * A modal dialog gives us the focus trap, the inert background and the top
 * layer for free, but **not** "tap outside to close" — that is the `closedby`
 * attribute, which is far newer than this app's Baseline 2023 floor. So it is
 * wired by hand, and this is the one implementation of it.
 *
 * The trick is that `::backdrop` is not a child element: it is a pseudo-element
 * of the dialog, so a click on it is dispatched with the `<dialog>` itself as
 * the target. Anything the player actually aimed at — the panel, a row, an
 * input — is a descendant and retargets to that descendant instead. So
 * `target === the dialog` is exactly "the click landed outside the content",
 * with no coordinate arithmetic and no guessing at the panel's bounds.
 *
 * One caveat this deliberately accepts: a dialog whose own box is larger than
 * its visible panel would treat the gap as inside. Both callers size the dialog
 * to its content (the quick-switch shrink-wraps its panel; the phone sheet is
 * the panel), so the gap does not exist.
 */

/** Close the dialog if the click landed on its backdrop rather than its
 * content. Safe to attach to any `<dialog>`; a click on content is ignored. */
export function closeOnBackdropClick(event: MouseEvent): void {
  const { target } = event;
  if (target instanceof HTMLDialogElement && event.currentTarget === target) {
    target.close();
  }
}
