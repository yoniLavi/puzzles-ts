// Last-resort error handling.

import { reportError } from "../dialogs/crash-dialog.ts";
import {
  type WorkerUnhandledErrorMessage,
  workerUnhandledErrorMessageType,
} from "./errors-shared.ts";

/**
 * Marks the last recovery reload, so a chunk that is missing for some reason a
 * reload cannot fix produces one reload rather than an endless loop.
 *
 * `sessionStorage` because the window is per-tab and per-visit: a reload
 * preserves it, a new tab starts clean. Both accessors are wrapped, because
 * reading or writing web storage *throws* where a browser blocks site data,
 * and a thrown guard here would take out the recovery it exists to bound.
 */
const STALE_CHUNK_RELOAD_KEY = "hintful.staleChunkReloadAt";
const STALE_CHUNK_RELOAD_COOLDOWN_MS = 30_000;

function recentlyReloadedForStaleChunks(): boolean {
  const now = Date.now();
  let previous = 0;
  try {
    previous = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) || 0;
  } catch {
    // Storage unavailable. Treat it as "no recent reload" so recovery still
    // happens; the cost of being wrong is one extra reload, not a loop, since
    // a page that cannot store also cannot accumulate.
  }
  if (now - previous < STALE_CHUNK_RELOAD_COOLDOWN_MS) {
    return true;
  }
  try {
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  } catch {
    // See above.
  }
  return false;
}

/**
 * Install last-resort error handlers on the main thread.
 * These will report unhandled exceptions and promise rejections.
 */
export function installErrorHandlers() {
  if (typeof window === "undefined") {
    throw new Error("installErrorHandlers must be called from the main thread");
  }

  // Recover from a stale page after a deploy.
  //
  // Screens import their dialogs lazily (`await import("../dialogs/…")`), and
  // every chunk filename carries a content hash. A deploy replaces those
  // hashes, and Cloudflare Pages serves only the current deployment — so a page
  // loaded before the deploy names files that no longer exist, and the next
  // lazy import fails with "Failed to fetch dynamically imported module".
  //
  // The page is stale, not broken, so recover rather than accuse: falling
  // through to the handler below shows a crash dialog, which is the wrong
  // report. A reload fetches HTML naming files that exist.
  //
  // Reloading is safe because it is not lossy: the puzzle screen autosaves to
  // IndexedDB after every move and restores on load, so a player is returned to
  // the position they were in. (Checked, not assumed — `puzzle-screen.ts`,
  // `autoSaveGame`.)
  window.addEventListener("vite:preloadError", (event) => {
    // Suppress Vite's default rethrow; we are handling it.
    event.preventDefault();
    if (recentlyReloadedForStaleChunks()) {
      // A second failure this soon means reloading did not fix it, so a reload
      // loop is the risk now rather than the cure. Report it for real.
      void reportError(
        `${String(event.payload).trim()} [stale chunk, and reloading did not help]`,
        event.payload,
      );
      return;
    }
    location.reload();
  });

  // Catch otherwise unhandled JavaScript errors
  window.addEventListener("error", (event) => {
    try {
      const { message, filename, lineno, colno, error } = event;
      // (The message already starts with "Uncaught Error:".)
      const errorMessage = `${message}${
        filename ? ` at ${filename}:${lineno}:${colno}` : ""
      }`;
      void reportError(errorMessage, error);
    } catch (error) {
      console.error("Error in onerror handler", error);
    }
  });

  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const error = event.reason instanceof Error ? event.reason : undefined;
      const errorMessage = [
        `${String(event.reason).trim()} [unhandled rejection]`,
        // Chrome includes the error message in the stack, others don't:
        (error?.stack || "").replace(String(error), "").trim(),
      ]
        .filter(Boolean)
        .join("\n");
      void reportError(errorMessage, error);
    } catch (error) {
      console.error("Error in onunhandledrejection handler", error);
    }
  });

  window.addEventListener("securitypolicyviolation", () => {
    // This warning may appear before or after the CSP error in the console
    console.warn(
      "🚨🚨🚨 This security violation is probably caused by a PLUGIN" +
        " or BROWSER EXTENSION trying to insecurely modify the page. 🚨🚨🚨",
    );
  });
}

//
// Worker unhandled errors
//

const isWorkerUnhandledErrorMessage = (
  event: MessageEvent<unknown>,
): event is MessageEvent<WorkerUnhandledErrorMessage> =>
  typeof event.data === "object" &&
  event.data !== null &&
  "type" in event.data &&
  event.data.type === workerUnhandledErrorMessageType;

const handleWorkerMessage = (event: MessageEvent<unknown>) => {
  if (isWorkerUnhandledErrorMessage(event)) {
    console.error(event.data.message, event.data.error);
    void reportError(event.data.message, event.data.error);
  }
};

/**
 * Counterpart to installErrorHandlersInWorker(). Listens for unhandled
 * errors coming from the worker and notifies about them.
 */
export function installWorkerErrorReceivers(worker: Worker) {
  if (typeof window === "undefined") {
    // handleWorkerMessage assumes it's in the main thread so can post UI.
    // (If needed, we could create a "forwarding" handler for workers-of-workers.)
    throw new Error("installWorkerErrorReceivers must be called from main thread");
  }

  worker.addEventListener("message", handleWorkerMessage);
}

/**
 * Remove any listeners added by installWorkerErrorReceivers().
 */
export function uninstallWorkerErrorReceivers(worker: Worker) {
  worker.removeEventListener("message", handleWorkerMessage);
}
