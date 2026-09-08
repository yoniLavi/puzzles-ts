import * as child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import * as path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import license from "rollup-plugin-license";
import { visualizer } from "rollup-plugin-visualizer";
import { build, defineConfig, loadEnv, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import Sitemap from "vite-plugin-sitemap";
import {
  APP_NAME,
  APP_SHORT_NAME,
  APP_TAGLINE,
  REPO_URL,
} from "./src/project-identity.ts";
import { puzzleIds, puzzleCatalog as puzzles } from "./src/puzzle/catalog-data.ts";
import { canonicalCoverage } from "./vite-plugins/canonical-coverage.ts";
import { dependencyNotices } from "./vite-plugins/dependency-notices.ts";
import {
  extraPages,
  renderHandlebars,
  renderMarkdown,
  type Transform,
} from "./vite-plugins/extra-pages.ts";
import { precacheCoverage } from "./vite-plugins/precache-coverage.ts";

/**
 * `esbuild.supported` is forwarded by Vite but absent from its type.
 *
 * Vite 8's `ESBuildOptions` narrows esbuild's own transform options and drops
 * `supported`, while the implementation still spreads it into what it hands the
 * transformer — it builds `supported: { ...defaultEsbuildSupported,
 * ...esbuildOptions.supported }` out of `config.esbuild`. So the option set
 * below is live, and the type is merely narrower than the behavior.
 *
 * Declared rather than cast: asserting the whole `esbuild` object would stop
 * checking every *other* key in it, and the gap is one property. If a future
 * Vite declares `supported` itself with a different shape, this conflicts
 * loudly, which is the outcome to want.
 */
declare module "vite" {
  interface ESBuildOptions {
    supported?: Record<string, boolean>;
  }
}

type Env = Record<string, string>;
type Headers = Record<string, string>;

function getGitSha(env: Env): string {
  return env["VITE_GIT_SHA"]
    ? env["VITE_GIT_SHA"]
    : child.execSync("git rev-parse HEAD").toString().trim();
}

function defaultAppVersion(env: Record<string, string>): string {
  const dateStr = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const gitSha = getGitSha(env);
  return `${dateStr}.${gitSha ? gitSha.slice(0, 7) : "unknown"}`;
}

function securityHeaders(options: {
  env: Env;
  reportOnly?: boolean;
  extraScriptSrc?: string[];
}): Headers {
  const { env, reportOnly = false, extraScriptSrc = [] } = options;
  const headers: Headers = {
    // Cloudflare defaults to Referrer-Policy: same-origin; we relax that a bit
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    // `DENY` and `SAMEORIGIN` are the only values browsers define; the `NONE`
    // this inherited is not one of them and was ignored wherever it was read.
    // The CSP's `frame-ancestors 'none'` below is what actually forbids
    // framing, so nothing was unprotected — but a header stating a value no
    // parser accepts is worse than no header, because it reads as a decision.
    // (Change this and `frame-ancestors` to "SAMEORIGIN"/'self' together if we
    // rework help-viewer to use an iframe.)
    "X-Frame-Options": "DENY",
    // No Strict-Transport-Security. The inherited comment here claimed
    // Cloudflare adds its own; measured against the deployed origin on
    // 2026-09-07, it does not — `hintful-puzzles.pages.dev` returns no HSTS
    // header at all. (It is a per-zone setting, and `pages.dev` is not our
    // zone.) That costs nothing today, because `pages.dev` is HTTPS-only and
    // has no apex we control. It becomes a real decision with the custom
    // domain, where HSTS is both worth having and awkward to reverse — so
    // decide it there, either as a zone setting or as a line in this map.
  };

  const csp: Record<string, string> = {
    "default-src": "'self'",
    // wa-icon uses fetch on icon urls that vite has inlined as data: uris
    "connect-src": `'self' data: blob:`,
    // Some accessibility extensions (and some browser anti-fingerprinting mechanisms)
    // use data: fonts.
    "font-src": "'self' data:",
    "img-src": "'self' data: blob:",
    "manifest-src": "'self'",
    "object-src": "'none'",
    // No analytics vendor origin. The policy inherited from the upstream fork
    // granted `https://static.cloudflareinsights.com` a script-src and
    // `https://cloudflareinsights.com` a connect-src unconditionally, for a
    // vendor this fork never chose and does not load — a whitelist of an unused
    // third-party script origin, which is strictly weaker for no benefit.
    //
    // They are removed rather than made conditional on `VITE_ANALYTICS_BLOCK`
    // because there is no honest conditional form for a vendor nobody has
    // picked: the block is arbitrary html, and Cloudflare's beacon posts to an
    // origin that does not appear anywhere in its own script tag, so gating
    // those two literals on a generic flag would hardcode one vendor's answer
    // behind a name that promises any vendor. Whichever change turns analytics
    // on adds the origins it needs, in the same change that adds the block.
    "script-src": ["'self'", ...extraScriptSrc, "'report-sample'"].join(" "),
    // Web Awesome uses inline styles in progress-ring and slider:
    // https://github.com/shoelace-style/webawesome/issues/1937
    "style-src": "'self' 'unsafe-inline' 'report-sample'",
    "worker-src": "'self'",
    "base-uri": "'none'",
    // (Change this to 'self' if we rework help-viewer to use an iframe)
    "frame-ancestors": "'none'",
  };

  if (env["VITE_SENTRY_DSN"]) {
    const sentryDsnOrigin = new URL(env["VITE_SENTRY_DSN"]).origin;
    csp["connect-src"] += ` ${sentryDsnOrigin}`;

    // Provide Sentry with high-entropy UA versions
    const clientHints = ["Platform-Version", "Full-Version-List", "Model"];
    headers["Accept-CH"] = clientHints.map((hint) => `Sec-CH-UA-${hint}`).join(", ");
    headers["Permissions-Policy"] = clientHints
      .map((hint) => `ch-ua-${hint.toLowerCase()}=("${sentryDsnOrigin}")`)
      .join(", ");
  }

  if (env["VITE_CSP_REPORT_URI"]) {
    let cspReportUri = env["VITE_CSP_REPORT_URI"];
    if (
      cspReportUri.includes("sentry_key") &&
      !cspReportUri.includes("sentry_release")
    ) {
      // Sentry CSP reporting allows a release id.
      // Should match Sentry.init 'release' param (see main.ts).
      const gitSha = getGitSha(env);
      if (gitSha) {
        cspReportUri += `&sentry_release=${encodeURIComponent(gitSha)}`;
      }
    }
    const cspReportOrigin = new URL(cspReportUri).origin;
    if (!csp["connect-src"].includes(cspReportOrigin)) {
      // (might already be in there if same as sentryDsnOrigin)
      csp["connect-src"] += ` ${cspReportOrigin}`;
    }
    csp["report-uri"] = cspReportUri;
    csp["report-to"] = "csp-endpoint";

    headers["Reporting-Endpoints"] = `csp-endpoint="${cspReportUri}"`;
    // Sentry recommends also setting the Report-To JSON header,
    // but every browser we support either prefers Reporting-Endpoints
    // or (Firefox) only uses the report-uri from the CSP.
  }

  headers[
    reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy"
  ] = Object.entries(csp)
    .map(([directive, values]) => `${directive} ${values}`)
    .join("; ");

  // Cloudflare: "Each line in the _headers file has a 2,000 character limit. The entire
  // line, including spacing, header name, and value, counts towards this limit."
  for (const [field, value] of Object.entries(headers)) {
    const length = `  ${field}: ${value}`.length;
    if (length > 2000) {
      throw new Error(`_headers line for ${field} too long: ${length} > 2000`);
    }
  }

  return headers;
}

/**
 * Cloudflare parses at most **100 rules** out of a `_headers` file — the same
 * 100 on Pages and on Workers static assets, on every plan. Exceeding it is the
 * silent-drop failure this repo keeps rediscovering: the file still ships, the
 * site still serves, and whichever rules fell off the end simply stop applying.
 *
 * A rule is a path pattern; the indented lines under it are its headers. The
 * template is written so the count does not grow with the catalog — it is ten
 * — so this is a guard against a future edit reintroducing a per-page rule, not
 * a budget anyone is expected to spend down.
 *
 * The count is asserted rather than written in a comment, because a count in
 * prose is a census nobody re-runs. `vite build` is in the commit gate, so a
 * rule-per-puzzle edit fails there rather than on a deployed origin, where
 * nothing a visitor can see would change.
 */
const CLOUDFLARE_HEADER_RULE_LIMIT = 100;

const checkHeaderRuleBudget: Transform = function (data) {
  const rendered = typeof data.html === "string" ? data.html : "";
  // Key on the shape a rule has — an unindented line naming a path pattern or a
  // full URL — not on the paths themselves, which are exactly what changes.
  const rules = rendered
    .split("\n")
    .filter((line) => /^(\/|https?:\/\/)\S*$/.test(line));
  if (rules.length === 0) {
    // Vacuity guard: an empty render would otherwise sail through the budget
    // check below while asserting nothing at all.
    this.error("_headers rendered no rules at all; the template is broken");
  }
  if (rules.length > CLOUDFLARE_HEADER_RULE_LIMIT) {
    this.error(
      `_headers has ${rules.length} rules, over Cloudflare's ` +
        `${CLOUDFLARE_HEADER_RULE_LIMIT}; the rules past the limit are dropped ` +
        "silently on the deployed origin. The template is meant to be constant " +
        "in the size of the catalog — see its header comment.",
    );
  }
  return data;
};

// (There was an `insertPuzzleScreenshot` transform here, which floated a
// thumbnail inside each help page's <h1>. It looked for
// `src/assets/icons/<puzzleId>-base.png`, and no puzzle has ever had one — the
// committed snapshot is `-64d8`/`-128d8`, which is what the `?screenshot`
// capture mode produces and what `asset-integrity.test.ts` asserts. So it never
// fired, on any page, and neither did the `img.screenshot` rule it fed.
// Removed rather than repointed: putting a thumbnail on a help page is a
// product decision, not a path fix.)

// Arbitrary metadata to identify own stack frames.
// Used as Sentry.thirdPartyErrorFilterIntegration filterKeys
/**
 * Files the service worker deliberately does not precache: the 404 page, and
 * the unsupported-browser page, which exists precisely for a browser that
 * cannot run the app (and therefore cannot install the worker).
 *
 * Shared between Workbox's `globIgnores` and the `precache-coverage` plugin, so
 * "deliberately excluded" has one definition. The plugin fails the build for
 * anything else that is emitted and not precached — which is how the
 * self-hosted fonts were caught shipping outside the offline cache.
 */
const PRECACHE_IGNORES = ["404.html", "**/unsupported*.{html,css,js}"];

const sentryFilterApplicationId = "code-from-puzzles-web";

/**
 * Pages deliberately absent from `sitemap.xml`: the 404 page and the
 * unsupported-browser page, neither of which is a destination.
 *
 * Shared between the sitemap plugin's `exclude` and `canonical-coverage`'s
 * exemptions, so "not advertised" has one definition. Two copies would let a
 * page be excused by one and demanded by the other.
 */
const NOT_IN_SITEMAP = ["/404", "/unsupported"];

// Build src/preflight.ts for production and return its (public) url.
// (It needs a lower build target than the main bundle, and must be kept
// separate from it by placing in the public dir.)
async function buildProductionPreflightModule() {
  const result = await build({
    configFile: false,
    build: {
      // Public files are not bundled into the main chunk.
      // (Use a subdirectory to avoid clobbering all of public.)
      outDir: "public/preflight",
      rollupOptions: {
        input: {
          preflight: "src/preflight.ts",
        },
        output: {
          entryFileNames: "preflight-[hash].js",
        },
      },
      manifest: false,
      sourcemap: true,
      // To avoid parse errors, syntax must target the earliest browsers
      // that supported <script type="module">. That's Chrome 61 and Safari 11
      // in September 2017.
      target: "es2017",
    },
    publicDir: false,
  });
  if (!("output" in result) || result.output.length !== 2) {
    // result should be a single RollupOutput object containing
    // two output entries: the built chunk and its sourcemap asset
    console.log(result);
    throw new Error("buildProductionPreflightModule unexpected build result");
  }
  const generatedFile = result.output[0].fileName;
  return `/preflight/${generatedFile}`; // url, not file path
}

// Build src/color-scheme-init.ts and return the contents for an inline head script.
async function buildColorSchemeInitScript() {
  const result = await build({
    configFile: false,
    build: {
      lib: {
        entry: "src/color-scheme-init.ts",
        formats: ["iife"],
        name: "colorSchemeInit",
      },
      rollupOptions: {
        output: { strict: false },
      },
      emptyOutDir: false,
      write: false,
      sourcemap: false,
      target: "es2022",
    },
  });
  if (!Array.isArray(result) || result.length !== 1 || result[0].output.length !== 1) {
    // result should be a single-entry RollupOutput[] array containing
    // one output entry: the built iife
    console.log(result);
    throw new Error("buildColorSchemeInitScript unexpected build result");
  }
  return result[0].output[0].code.trim();
}

/**
 * Return the CSP script-src item needed to allow inlineCode by hash.
 * (Should also works for style-src, font-src, etc.)
 */
function cspHashSrc(inlineCode: string) {
  const hash = crypto.createHash("sha256").update(inlineCode).digest("base64");
  return `'sha256-${hash}'`;
}

/**
 * A chrome color from `src/css/theme.css`, read at build time.
 *
 * The PWA manifest's `background_color` (the splash screen) and `theme_color`
 * (the OS status bar) are the light scheme's page ground and rail — the same
 * two decisions the CSS makes, and a player sees them *before* a stylesheet has
 * loaded, so they cannot be expressed as custom properties. Typing them out
 * again is what made them stale: the manifest still carried Web Awesome's stock
 * brand blue long after nothing else in the app did.
 *
 * So they are **derived rather than duplicated-and-checked**. The light value
 * is the definition before `:root.wa-dark`, because a manifest has one pair of
 * colors and no way to express a scheme, and a cold boot shows light.
 *
 * Absence throws: `vite build` is in the commit gate, so a renamed or deleted
 * token fails there rather than shipping a manifest with a hole in it.
 */
function themeColor(token: string): string {
  const source = fs.readFileSync("src/css/theme.css", "utf8");
  // Split on the dark *selector*, brace included — the file's own doc comment
  // names `:root.wa-dark` in prose, and splitting on the bare name cut the
  // light block off above every token in it. Key on the syntax, not the name.
  const lightBlock = source.split(/:root\.wa-dark\s*\{/)[0];
  const value = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(
    lightBlock,
  )?.[1];
  if (!value) {
    throw new Error(
      `${token} is not defined in the light block of src/css/theme.css; ` +
        "the PWA manifest reads it for the splash screen and status bar",
    );
  }
  return value;
}

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  const preflightSrc =
    command === "build" ? await buildProductionPreflightModule() : "/src/preflight.ts";

  const noModuleHeadScript = `location.href="/unsupported?f=${encodeURIComponent('<script type="module">')}";`;
  const colorSchemeInitScript = await buildColorSchemeInitScript();
  const extraScriptSrc = [
    cspHashSrc(colorSchemeInitScript),
    cspHashSrc(noModuleHeadScript),
  ];

  let canonicalBaseUrl = env["VITE_CANONICAL_BASE_URL"];
  if (canonicalBaseUrl && !canonicalBaseUrl.endsWith("/")) {
    canonicalBaseUrl += "/";
  }

  /**
   * The canonical URL of a page, **derived from the pathname the pipeline
   * already carries** rather than computed per page set.
   *
   * It used to be computed per set, and only two of the four sets did it — so
   * the 62 help pages went into `sitemap.xml` with no `<link rel="canonical">`
   * at all, while the index and the 57 puzzle pages had one. Nothing could
   * notice: each set was individually correct, and the two that were checked
   * by hand after the domain went live were the two that worked.
   *
   * Deriving it from `urlPathname` means a page set cannot opt out by
   * omission, and a page set added later gets it without being told. The forms
   * must match what `vite-plugin-sitemap` advertises, because a canonical that
   * disagrees with the sitemap is worse than none: `index.html` is the base
   * itself, `pegs.html` is `/pegs`, and `help/index.html` is `/help` with no
   * trailing slash.
   */
  const canonicalUrlFor = (urlPathname: unknown): string | undefined => {
    if (!canonicalBaseUrl) {
      return undefined;
    }
    const path = String(urlPathname)
      .replace(/\.html$/, "")
      .replace(/(^|\/)index$/, "");
    return new URL(path, canonicalBaseUrl).href;
  };

  const withCanonicalUrl: Transform = (data) => ({
    ...data,
    canonicalUrl: canonicalUrlFor(data.urlPathname),
  });
  const analytics_html = env["VITE_ANALYTICS_BLOCK"];
  const commonTemplateData = {
    appName: APP_NAME,
    tagline: APP_TAGLINE,
    repoUrl: REPO_URL,
    // How many puzzles the app actually ships, for the pages that say so.
    // Counted from the catalog rather than written out, because it was written
    // out — "Fifty-seven" appeared in the front page's intro and again in its
    // meta description, and the 58th game would have left both of them lying
    // in a place nobody re-reads.
    puzzleCount: puzzleIds.length,
    preflightSrc,
    analytics_html,
    colorSchemeInitScript,
    noModuleHeadScript,
  };
  const createSentryVitePlugin = () =>
    sentryVitePlugin({
      applicationKey: sentryFilterApplicationId,

      // We're not currently uploading sourcemaps or notifying releases from here,
      // and we use a different mechanism to include the release id in the code.
      sourcemaps: { disable: true },
      release: { create: false, inject: false, deploy: false, finalize: false },
    });

  return {
    appType: "mpa",
    build: {
      rollupOptions: {
        input: [
          // See also extraPages plugin below, which adds index, puzzle and help page inputs
          "unsupported.html",
        ],
        output: {
          manualChunks: (id) => {
            if (id.includes("node_modules/@sentry")) {
              return "sentry";
            }
          },
        },
      },
      sourcemap: true,
      target: "es2022",
    },
    esbuild: {
      supported: {
        // Avoid a Safari bug that breaks the module graph
        // if two modules import a third that uses top-level await.
        // https://bugs.webkit.org/show_bug.cgi?id=242740
        "top-level-await": false,
      },
    },
    define: {
      "import.meta.env.VITE_CANONICAL_BASE_URL": JSON.stringify(
        env["VITE_CANONICAL_BASE_URL"] ?? "",
      ),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(
        env["VITE_APP_VERSION"] ?? defaultAppVersion(env),
      ),
      "import.meta.env.VITE_SENTRY_FILTER_APPLICATION_ID": JSON.stringify(
        sentryFilterApplicationId,
      ),
    },
    preview: {
      headers: securityHeaders({ env, extraScriptSrc }),
    },
    plugins: [
      visualizer({
        filename: "dist-stats.html",
        gzipSize: true,
        brotliSize: true,
        title: "Puzzles Bundle Analysis",
      }),
      license({
        thirdParty: {
          output: {
            file: path.join(import.meta.dirname, "dist", "dependencies-app.json"),
            // Attribution is derived from each package, and the build fails
            // rather than ship an unfilled license template or an uncredited
            // package. See vite-plugins/dependency-notices.ts.
            template: dependencyNotices,
          },
        },
      }),
      extraPages({
        // debug: true,
        pages: [
          {
            virtualPages: [
              { urlPathname: "index.html", data: { ...commonTemplateData } },
            ],
            transforms: [
              withCanonicalUrl,
              renderHandlebars({ file: "templates/index.html.hbs" }),
            ],
          },
          {
            virtualPages: Object.entries(puzzles).map(([id, puzzleData]) => {
              let iconUrl: string | undefined = `src/assets/icons/${id}-64d8.png`;
              if (!fs.existsSync(iconUrl)) {
                iconUrl = undefined;
              }
              return {
                urlPathname: `${id}.html`,
                data: {
                  ...commonTemplateData,
                  puzzle: {
                    id,
                    isOriginal: puzzleData.collection === "original",
                    ...puzzleData,
                  },
                  iconUrl,
                },
              };
            }),
            transforms: [
              withCanonicalUrl,
              renderHandlebars({ file: "templates/puzzle.html.hbs" }),
            ],
          },
          {
            // Our own help pages, served at /help/...
            // Deliberately non-recursive: `help/games/` is rendered by its own
            // entry below, with the per-puzzle template.
            sources: "help/*.md",
            transforms: [
              renderMarkdown({
                html: true, // allow HTML tags in markdown
                linkify: true,
                typographer: true,
              }),
              (data) => ({ ...commonTemplateData, ...data }),
              withCanonicalUrl,
              renderHandlebars({ file: "help/_template.html.hbs" }),
            ],
          },
          {
            // The per-puzzle help pages, one per cataloged game, served at
            // /help/<puzzleId>.html. All 57 are this project's own markdown:
            // `help-coverage.test.ts` holds the directory and the catalog to
            // each other in both directions.
            sources: "help/games/*.md",
            resolve: { url: "help/", path: "help/games/" },
            transforms: [
              (data) => ({ ...commonTemplateData, ...data }),
              renderMarkdown({
                html: true, // allow HTML tags in markdown
                linkify: true,
                typographer: true,
              }),
              withCanonicalUrl,
              renderHandlebars({ file: "help/_game.html.hbs" }),
            ],
          },
          {
            // Cloudflare `_headers` — read verbatim by Pages and by Workers
            // static assets. No `puzzleIds`: the file is deliberately constant
            // in the size of the catalog (see the template's header comment).
            virtualPages: [
              {
                urlPathname: "_headers",
                data: {
                  securityHeaders: securityHeaders({ env, extraScriptSrc }),
                },
              },
            ],
            transforms: [
              renderHandlebars({ file: "templates/_headers.txt.hbs" }),
              checkHeaderRuleBudget,
            ],
            entryPoint: false,
          },
        ],
      }),
      VitePWA({
        injectRegister: null, // registered in main.ts
        manifest: {
          name: env["VITE_APP_NAME"] || APP_NAME,
          short_name: APP_SHORT_NAME,
          // Read out of the stylesheet rather than typed here; see themeColor.
          background_color: themeColor("--app-color-ground"),
          theme_color: themeColor("--app-color-rail"),
        },
        registerType: "prompt",
        pwaAssets: {
          image: "public/favicon.svg",
        },
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectManifest: {
          // enableWorkboxModulesLogs: true, // see workbox logging in production
          globIgnores: PRECACHE_IGNORES,
          // Include all help files, icons, fonts, etc. (There is no wasm to
          // precache any more — every game is native TypeScript, so it ships
          // inside the worker bundle.)
          //
          // `woff2` is here because the app self-hosts IBM Plex (see
          // `src/css/fonts.css`) precisely so that offline is the same as
          // online. Without the extension the faces build and ship but are not
          // precached, so the first offline visit renders in the fallback stack
          // — a silent, cosmetic-looking failure of the whole reason they are
          // not loaded from Google Fonts. `src/pwa-precache.test.ts` holds the
          // pattern to the asset types the build actually emits.
          // `ico` is the tab icon, which the guard found was also outside the
          // cache — a second, older gap of the same kind.
          globPatterns: ["**/*.{css,html,ico,js,json,png,svg,woff2}"],
        },
      }),
      // After VitePWA, because it reads the sw.js that plugin writes. It is
      // handed the *same* globIgnores array, so the files Workbox deliberately
      // skips and the files this check skips cannot drift apart.
      precacheCoverage({ globIgnores: PRECACHE_IGNORES }),
      // Holds `sitemap.xml` and every page's `<link rel="canonical">` to each
      // other. Inert without VITE_CANONICAL_BASE_URL, since neither exists
      // then; live in CI, which is the build that reaches players.
      canonicalCoverage({ excluded: NOT_IN_SITEMAP }),
      createSentryVitePlugin(), // Must be last plugin
      // sitemap.xml and robots.txt are SEO deploy artifacts that require the
      // canonical URL; without it the plugin crashes (it calls
      // hostname.endsWith on undefined) and its output would be meaningless
      // anyway. Only register it when VITE_CANONICAL_BASE_URL is set.
      canonicalBaseUrl
        ? Sitemap({
            // readable: true, // formatted XML
            hostname: canonicalBaseUrl.replace(/\/$/, ""),
            changefreq: "weekly",
            generateRobotsTxt: true,
            // The plugin emits `/help` for `help/index.html`, while Cloudflare
            // serves a folder index WITH a trailing slash and 308s `/help` to
            // `/help/` — which is also what the app's own header links to and
            // what the canonical says. The two forms denote one resource, and
            // the plugin normalizes a trailing slash away (0.8.2, the current
            // release), so `exclude` + `dynamicRoutes` cannot express it. The
            // agreement check in `canonical-coverage` compares resources
            // rather than strings instead, which is the correct comparison
            // rather than a loosened one.
            exclude: NOT_IN_SITEMAP,
          })
        : undefined,
    ],
    worker: {
      plugins: () => [createSentryVitePlugin()],
    },
  } satisfies UserConfig;
});
