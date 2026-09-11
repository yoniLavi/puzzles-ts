/**
 * **Every page the sitemap advertises carries a canonical link, and the two
 * agree on the URL — or the build fails.**
 *
 * `sitemap.xml` tells crawlers which pages exist; `<link rel="canonical">`
 * tells them which URL is the real one for the page they are looking at. The
 * app is served from two origins at once — the custom domain and the
 * `pages.dev` project domain — so the canonical is what keeps the second from
 * competing with the first. A page in the sitemap with no canonical is
 * advertised and unanchored.
 *
 * Two real defects motivate this, both invisible to every other instrument:
 *
 * 1. `canonicalUrl` was computed per page set, and only two of the four sets
 *    did it, so 62 help pages shipped with none. Every set was individually
 *    correct; the sitemap was correct; and the two pages spot-checked by hand
 *    on the live origin were the two that happened to work.
 * 2. Once fixed, the canonical and the sitemap **disagreed** about the help
 *    index: the sitemap said `/help` and the server 308s that to `/help/`,
 *    which is what the canonical and the app's own header say. A sitemap
 *    advertising a redirect is a weaker sitemap for no reason.
 *
 * The second is the argument for comparing the two artifacts rather than
 * checking each alone. Neither is wrong on its own terms; they were wrong
 * about each other.
 *
 * Runs only when a sitemap is emitted, which is to say only when
 * `VITE_CANONICAL_BASE_URL` is set — the same condition that makes any of this
 * meaningful. That is a real conditional rather than a silent skip: with no
 * canonical base URL there are no canonical links to check and no sitemap to
 * check them against.
 */
import fs from "node:fs";
import path from "node:path";
import { globSync } from "tinyglobby";
import type { Plugin } from "vite";

export interface CanonicalCoverageOptions {
  outDir?: string;
  /**
   * Pages deliberately absent from the sitemap, and therefore exempt. Passed
   * from the same list the sitemap plugin is given, so "excluded" has one
   * definition rather than two that can drift.
   */
  excluded?: string[];
}

const CANONICAL_RE = /<link\s+rel="canonical"\s+href="([^"]+)"/i;

/**
 * A URL reduced to the resource it names, so the comparison below is between
 * resources rather than strings.
 *
 * The only difference this forgives is a trailing slash, and it is not a
 * loosening: `/help` and `/help/` are one page, and the server says so — it
 * 308s the first to the second. The sitemap plugin normalizes a trailing slash
 * away and offers no way to keep one (0.8.2, the current release, checked
 * rather than assumed), while the canonical must carry it because that is the
 * URL Cloudflare serves a folder index at and the URL the app's own links use.
 * Comparing the raw strings would report a disagreement that does not exist.
 */
function asResource(url: string): string {
  return url.replace(/\/+$/, "");
}

export function canonicalCoverage(options: CanonicalCoverageOptions = {}): Plugin {
  const outDir = options.outDir ?? "dist";
  const excluded = new Set(options.excluded ?? []);
  let bundled = false;
  return {
    name: "canonical-coverage",
    apply: "build",
    generateBundle() {
      bundled = true;
    },
    closeBundle: {
      // After vite-plugin-sitemap has written sitemap.xml.
      order: "post",
      handler() {
        // Never report someone else's failure as this one's: `closeBundle`
        // runs even when an earlier plugin threw, and `dist/` is half-written.
        if (!bundled) return;
        const sitemapPath = path.join(outDir, "sitemap.xml");
        if (!fs.existsSync(sitemapPath)) {
          // No VITE_CANONICAL_BASE_URL: nothing to check, by design.
          return;
        }

        const sitemap = fs.readFileSync(sitemapPath, "utf8");
        const advertised = new Set(
          [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => asResource(m[1])),
        );
        const pages = globSync("**/*.html", { cwd: outDir }).filter(
          (p) => !excluded.has(`/${p.replace(/\.html$/, "")}`),
        );

        // Vacuity guards, both directions: an empty glob or an empty sitemap
        // would let every assertion below pass over nothing and report health.
        if (pages.length < 50 || advertised.size < 50) {
          throw new Error(
            `canonical-coverage: found ${pages.length} pages and ` +
              `${advertised.size} sitemap entries under ${outDir}/ — far too ` +
              "few to be the real build, so this check would assert nothing",
          );
        }

        const missing: string[] = [];
        const disagreeing: string[] = [];
        for (const page of pages) {
          const html = fs.readFileSync(path.join(outDir, page), "utf8");
          const canonical = CANONICAL_RE.exec(html)?.[1];
          if (!canonical) {
            missing.push(page);
          } else if (!advertised.has(asResource(canonical))) {
            disagreeing.push(`${page} -> ${canonical}`);
          }
        }

        if (missing.length > 0) {
          throw new Error(
            `canonical-coverage: ${missing.length} page(s) are in the build ` +
              'with no <link rel="canonical">, so nothing anchors them to ' +
              "the canonical origin. Their template needs the tag; " +
              "`withCanonicalUrl` in vite.config.ts already supplies the " +
              `value to every page set:\n  ${missing.slice(0, 8).join("\n  ")}`,
          );
        }
        if (disagreeing.length > 0) {
          throw new Error(
            `canonical-coverage: ${disagreeing.length} page(s) name a ` +
              "canonical URL that the sitemap does not advertise. One of the " +
              "two is wrong about the URL the server actually serves — check " +
              "which form redirects before deciding which to change:\n  " +
              disagreeing.slice(0, 8).join("\n  "),
          );
        }
      },
    },
  };
}
