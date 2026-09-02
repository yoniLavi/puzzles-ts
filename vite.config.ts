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
import { puzzleIds, puzzleCatalog as puzzles } from "./src/puzzle/catalog-data.ts";
import {
  extraPages,
  renderHandlebars,
  renderMarkdown,
} from "./vite-plugins/extra-pages.ts";

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
    // (Change this to "SAMEORIGIN" if we rework help-viewer to use an iframe)
    "X-Frame-Options": "NONE",
    // Cloudflare also adds its own Expect-CT and Strict-Transport-Security,
    // plus the obsolete X-Xss-Protection
  };

  const csp: Record<string, string> = {
    "default-src": "'self'",
    // wa-icon uses fetch on icon urls that vite has inlined as data: uris
    "connect-src": `'self' data: blob: https://cloudflareinsights.com`,
    // Some accessibility extensions (and some browser anti-fingerprinting mechanisms)
    // use data: fonts.
    "font-src": "'self' data:",
    "img-src": "'self' data: blob:",
    "manifest-src": "'self'",
    "object-src": "'none'",
    "script-src": [
      "'self'",
      "https://static.cloudflareinsights.com",
      ...extraScriptSrc,
      "'report-sample'",
    ].join(" "),
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
const sentryFilterApplicationId = "code-from-puzzles-web";

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
  const analytics_html = env["VITE_ANALYTICS_BLOCK"];
  const commonTemplateData = {
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
            template(deps) {
              const dependencies = deps.map(
                ({ name, version, license, licenseText, noticeText }) => {
                  if (license === "Apache-2.0" && !noticeText && licenseText) {
                    // Some Apache-2.0 license users leave the required notice
                    // in the template at the end of the license. (Some don't even
                    // bother filling in the template, but that's a different issue).
                    // Extract that notice, from a line starting "Copyright" to the end.
                    const match =
                      /APPENDIX: How to apply the Apache License.*^\s*(Copyright.+)/ms.exec(
                        licenseText,
                      );
                    if (match) {
                      noticeText = match[1];
                    }
                  }
                  if (name === "workbox-window") {
                    // The service worker uses several other workbox-* packages.
                    // All share the same copyright and license (from their monorepo).
                    // To avoid repeating this plugin in the VitePWA config,
                    // use "workbox" to refer to all workbox packages used.
                    name = "workbox";
                  }
                  const notice = noticeText || licenseText;
                  return {
                    name,
                    version,
                    license,
                    notice,
                  };
                },
              );
              return JSON.stringify({ dependencies });
            },
          },
        },
      }),
      extraPages({
        // debug: true,
        pages: [
          {
            virtualPages: [
              {
                urlPathname: "index.html",
                data: {
                  ...commonTemplateData,
                  canonicalUrl: canonicalBaseUrl || undefined,
                },
              },
            ],
            transforms: [renderHandlebars({ file: "templates/index.html.hbs" })],
          },
          {
            virtualPages: Object.entries(puzzles).map(([id, puzzleData]) => {
              const canonicalUrl = canonicalBaseUrl
                ? new URL(id, canonicalBaseUrl).href
                : undefined;
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
                  canonicalUrl,
                },
              };
            }),
            transforms: [renderHandlebars({ file: "templates/puzzle.html.hbs" })],
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
              renderHandlebars({ file: "help/_game.html.hbs" }),
            ],
          },
          {
            // Cloudflare Pages HTTP headers
            virtualPages: [
              {
                urlPathname: "_headers",
                data: {
                  puzzleIds,
                  securityHeaders: securityHeaders({ env, extraScriptSrc }),
                },
              },
            ],
            transforms: [renderHandlebars({ file: "templates/_headers.txt.hbs" })],
            entryPoint: false,
          },
        ],
      }),
      VitePWA({
        injectRegister: null, // registered in main.ts
        manifest: {
          name: env["VITE_APP_NAME"] || "Puzzles web app",
          short_name: "Puzzles",
          background_color: "#e8f3ff", // --wa-color-brand-fill-quiet (page bg)
          theme_color: "#d1e8ff", // --wa-color-brand-fill-normal (app bar)
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
          globIgnores: ["404.html", "**/unsupported*.{html,css,js}"],
          // Include all help files, icons, etc. (There is no wasm to
          // precache any more — every game is native TypeScript, so it ships
          // inside the worker bundle.)
          globPatterns: ["**/*.{css,html,js,json,png,svg}"],
        },
      }),
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
            exclude: [
              // Skip 404.html and unsupported.html
              "/404",
              "/unsupported",
            ],
          })
        : undefined,
    ],
    worker: {
      plugins: () => [createSentryVitePlugin()],
    },
  } satisfies UserConfig;
});
