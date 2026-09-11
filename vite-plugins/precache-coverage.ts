/**
 * **Every asset the build emits is precached, or the build fails.**
 *
 * The PWA promises to work offline, and that promise is kept by one line in
 * `vite.config.ts` — Workbox's `globPatterns`, an extension allowlist. An asset
 * whose extension is missing from it **still builds and still ships**; it is
 * simply absent from the service worker's manifest, so it loads fine online and
 * is silently missing offline. Nothing in the build, the type checker or the
 * test suite can see it, because nothing is wrong with the file.
 *
 * That is not hypothetical: `implement-front-page-and-chrome` self-hosted three
 * IBM Plex `woff2` faces *specifically* so that offline would match online, and
 * the pattern had no `woff2` in it. The faces shipped, were not precached, and
 * the first offline visit would have rendered in the fallback stack — a failure
 * that looks cosmetic and is actually the whole reason the fonts are not loaded
 * from a CDN.
 *
 * So the check reads the **real output**: every file under `dist/` that is not
 * itself build machinery, against the URLs the generated service worker will
 * precache. It runs in `closeBundle`, after `vite-plugin-pwa` has written
 * `sw.js`, which is why this plugin must sit *after* `VitePWA` in the plugin
 * array.
 *
 * It reports the offending **extensions**, not the files, because the fix is
 * always to the allowlist and a list of forty hashed filenames buries that.
 */
import fs from "node:fs";
import path from "node:path";
import { globSync } from "tinyglobby";
import type { Plugin } from "vite";

/**
 * Build machinery rather than things a page loads: the service worker itself
 * (registered, never fetched from its own cache), the manifest that lists
 * everything else, source maps, and the two deploy-side files for crawlers.
 *
 * Held to being **exactly right** below — an entry that stops matching anything
 * is a note about a file that is gone, and would quietly excuse a future file
 * that happened to take the same name.
 */
const NOT_PRECACHEABLE: Record<string, { why: string; conditional?: true }> = {
  "sw.js": { why: "the service worker is registered, not fetched from its own cache" },
  "manifest.webmanifest": { why: "read by the browser before the worker exists" },
  _headers: { why: "a Cloudflare deploy directive; not served to the page" },
  "**/*.map": {
    why: "source maps are a debugging aid; caching them doubles the store",
  },
  // `robots.txt` is NOT conditional: `public/robots.txt` is copied on every
  // build, and `vite-plugin-sitemap` overwrites it only when
  // VITE_CANONICAL_BASE_URL is set.
  "robots.txt": { why: "for crawlers, never fetched by the app" },
  // `sitemap.xml` genuinely is conditional: the plugin is registered only when
  // VITE_CANONICAL_BASE_URL is set, so its absence from an ordinary build is
  // not a stale entry. `conditional` is what keeps the reverse check below
  // honest rather than merely quiet: without it the check would fail on every
  // local build, and the fix would have been to delete the check.
  "sitemap.xml": { why: "for crawlers, never fetched by the app", conditional: true },
};

export interface PrecacheCoverageOptions {
  outDir?: string;
  /**
   * The **same array** passed to `injectManifest.globIgnores`, so the files
   * Workbox deliberately skips are the files this skips. Passing it rather than
   * restating it is the point: a second copy of the exclusions is the thing
   * that would let a real gap hide behind a stale excuse.
   */
  globIgnores?: string[];
}

export function precacheCoverage(options: PrecacheCoverageOptions = {}): Plugin {
  const outDir = options.outDir ?? "dist";
  const globIgnores = options.globIgnores ?? [];
  /**
   * Whether this build got as far as producing a bundle.
   *
   * `closeBundle` runs even when an earlier plugin's `generateBundle` threw,
   * and `dist/` is then half-written — so the file-count guard below fired on a
   * failed build and reported "the listing found almost nothing" as the error,
   * burying the one that actually stopped the build. A guard that reports
   * someone else's failure as its own is worse than no guard: it sends the next
   * reader to the wrong file.
   */
  let bundled = false;
  return {
    name: "precache-coverage",
    apply: "build",
    generateBundle() {
      bundled = true;
    },
    closeBundle: {
      // After vite-plugin-pwa has written sw.js.
      order: "post",
      handler() {
        if (!bundled) return; // the build failed before a bundle existed
        const swPath = path.join(outDir, "sw.js");
        if (!fs.existsSync(swPath)) return; // no service worker in this build
        const sw = fs.readFileSync(swPath, "utf8");

        const ignore = [...globIgnores, ...Object.keys(NOT_PRECACHEABLE)];
        const files = globSync("**/*", { cwd: outDir, ignore, onlyFiles: true });
        if (files.length < 50) {
          throw new Error(
            `precache-coverage: only ${files.length} files under ${outDir}/ — ` +
              "the listing found almost nothing, so this check would pass over " +
              "an empty population",
          );
        }

        // Workbox writes the manifest into sw.js as `{url, revision}` entries;
        // a file is precached when its emitted path appears there. Reported by
        // **extension**, because the fix is always to the allowlist and forty
        // hashed filenames would bury that.
        const missing = new Map<string, string>();
        for (const url of files) {
          const ext = path.extname(url) || url;
          if (!sw.includes(url) && !missing.has(ext)) missing.set(ext, url);
        }

        if (missing.size > 0) {
          const detail = [...missing]
            .map(([ext, example]) => `  ${ext}  (e.g. ${example})`)
            .join("\n");
          throw new Error(
            "precache-coverage: these asset types are built but NOT precached, " +
              "so they are missing offline. Add the extensions to " +
              "`injectManifest.globPatterns` in vite.config.ts, or — if a page " +
              "genuinely never loads them — to `globIgnores` beside it:\n" +
              detail,
          );
        }

        // The exclusion list is held to being exactly right in the other
        // direction too: an unconditional excuse that matches nothing is a note
        // about a file that is gone, and would quietly cover a future file that
        // happened to take the same name.
        const staleExcuses = Object.entries(NOT_PRECACHEABLE)
          .filter(([, entry]) => entry.conditional !== true)
          .map(([pattern]) => pattern)
          .filter(
            (pattern) =>
              globSync(pattern, { cwd: outDir, onlyFiles: true }).length === 0,
          );
        if (staleExcuses.length > 0) {
          throw new Error(
            "precache-coverage: NOT_PRECACHEABLE excuses files the build no " +
              `longer emits: ${staleExcuses.join(", ")}`,
          );
        }
      },
    },
  };
}
