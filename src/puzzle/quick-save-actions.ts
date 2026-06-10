/**
 * Quick-save actions shared by every surface that triggers them — the
 * game menu, the bottom-right toolbar button (`puzzle-history`), and the
 * Cmd/Ctrl+S shortcut (`puzzle-screen`). One implementation so the
 * check→save→confirm behaviour is identical wherever it's invoked.
 */
import { showAlert } from "../dialogs/alert-dialog.ts";
import { showToast } from "../dialogs/toast.ts";
import { savedGames } from "../store/saved-games.ts";
import type { Puzzle } from "./puzzle.ts";

/**
 * Combined Check-&-Save. On a game with mistake-checking, validate first
 * and quick-save only a provably-clean board; on mistakes, leave the
 * previous checkpoint intact and report them (the engine has already
 * highlighted them) via an interrupting modal. On a game without
 * mistake-checking, this is a plain quick-save. Success is confirmed with
 * a non-blocking toast, never a modal.
 */
export async function checkAndSave(puzzle: Puzzle): Promise<void> {
  if (puzzle.canFindMistakes) {
    const n = await puzzle.findMistakes();
    if (n > 0) {
      await showAlert({
        label: "Not saved",
        message: `${n} mistake${n === 1 ? "" : "s"} found — the problem ${
          n === 1 ? "cell is" : "cells are"
        } highlighted. Fix ${n === 1 ? "it" : "them"} before saving a checkpoint.`,
        type: "warning",
        lightDismiss: true,
      });
      return;
    }
  }
  await savedGames.quickSave(puzzle);
  showToast({
    label: "Checkpoint saved",
    message: "Use Quick-load to return here.",
    type: "success",
  });
}

/** Restore the quick-save slot for `puzzle`, confirming success with a
 * toast and reporting an unreadable/absent slot with a modal. */
export async function quickLoadPuzzle(puzzle: Puzzle): Promise<void> {
  if (!savedGames.hasQuickSave(puzzle.puzzleId)) return;
  const { found, error } = await savedGames.quickLoad(puzzle);
  if (error) {
    await showAlert({
      label: "Unable to quick-load",
      message: error,
      type: "error",
    });
  } else if (!found) {
    await showAlert({
      label: "No quick-save",
      message: "There is no quick-save for this puzzle yet.",
      type: "info",
      lightDismiss: true,
    });
  } else {
    showToast({
      label: "Quick-save restored",
      message: "Back to your saved checkpoint.",
      type: "success",
    });
  }
}
