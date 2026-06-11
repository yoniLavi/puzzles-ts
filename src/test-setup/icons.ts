/**
 * No-fetch `wa-icon` libraries for component tests (tier 3).
 *
 * `wa-icon` resolves an icon name to a URL and then `fetch`es it to read
 * the SVG (`resolveIcon` in WebAwesome's icon chunk). Under happy-dom that
 * fetch is a real async task: a test renders an icon, finishes before the
 * fetch settles, and window teardown calls `AsyncTaskManager.abortAll`,
 * which logs a stray `AbortError` / `Fetch.abortAll` stack to the console.
 * The run still passes, but the noise can mask a genuine teardown failure.
 *
 * `wa-icon` has one code path that never fetches: a library marked
 * `spriteSheet: true` renders `<svg><use href="…"></svg>` instead. We don't
 * need real glyphs in logic/DOM tests, so importing this module registers
 * the libraries our components use (`default`, `system`) as sprite-sheet
 * libraries with a trivial fragment resolver. No fetch is ever queued, so
 * teardown has nothing to abort.
 *
 * Import it in any `// @vitest-environment happy-dom` file that mounts a
 * component rendering `<wa-icon>` (directly or transitively):
 *
 *   import "../test-setup/icons.ts";
 */
import { registerIconLibrary } from "@awesome.me/webawesome/dist/components/icon/library.js";

for (const name of ["default", "system"]) {
  registerIconLibrary(name, {
    spriteSheet: true,
    // Sprite-sheet libraries use the returned URL as a `<use href>`; a bare
    // fragment renders an empty <use> with no network request.
    resolver: (iconName) => `#${iconName}`,
  });
}
