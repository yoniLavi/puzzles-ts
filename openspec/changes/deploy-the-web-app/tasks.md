# Tasks — deploy-the-web-app

## 0. Host-independent defects, fixed ahead of the host decision

These were found reviewing the proposal (2026-09-07). Each is wrong on *every*
candidate host, so none of them waits on the choice.

- [x] 0.1 **The `_headers` rule budget.** The file emitted one rule per puzzle
      entry page — 71 rules at 57 puzzles against Cloudflare's cap of 100, which
      made a parser limit a limit on the number of games (~88). Inverted the
      cache default in `templates/_headers.txt.hbs` so `/*` carries the short
      cache the entry pages want and only the long-cached paths detach it: the
      file is now **10 rules, constant in the size of the catalog**. Dropped the
      now-unused `puzzleIds` from the template's data. See `design.md` §1.
- [x] 0.2 **Assert the budget rather than write it down.**
      `checkHeaderRuleBudget` in `vite.config.ts` counts rendered rules and
      fails `vite build` (in the commit gate) above 100, with a vacuity guard
      for a render containing no rules at all. Both branches proved to fail
      before being trusted.
- [x] 0.3 **`X-Frame-Options: NONE` → `DENY`.** `NONE` is not a value any
      browser defines, so the header was ignored wherever it was read. Nothing
      was unprotected — the CSP's `frame-ancestors 'none'` is what forbids
      framing — but a header stating a value no parser accepts reads as a
      decision. Comment at the site now names both halves to change together.
- [x] 0.4 **One stale claim about `robots.txt`, in three places.**
      `public/robots.txt` is copied on *every* build; `vite-plugin-sitemap` only
      overwrites it when `VITE_CANONICAL_BASE_URL` is set. The file's own body,
      this change's proposal, and a `conditional: true` entry in
      `vite-plugins/precache-coverage.ts` all said the plugin was the only thing
      that emitted it. All three corrected; `sitemap.xml` stays conditional
      because it genuinely is.
- [x] 0.5 **`precache-coverage`'s vacuity guard masked other plugins'
      failures.** `closeBundle` runs even when an earlier `generateBundle`
      threw, and `dist/` is half-written by then — so the file-count guard fired
      on a failed build and reported "the listing found almost nothing" as *the*
      error, burying the one that actually stopped the build. (Found because it
      buried 0.2's deliberate failure.) Now gated on a `generateBundle` flag.
- [x] 0.6 **The CSP names no analytics vendor.** Removed
      `https://static.cloudflareinsights.com` from `script-src` and
      `https://cloudflareinsights.com` from `connect-src`. Removed rather than
      made conditional — see `design.md` §4 and the comment at the site.

## 1. Choose the host (owner's call — do not pick one silently)

- [x] 1.1 Put the comparison to the owner. **Decided 2026-09-07: Cloudflare
      Pages.** The header question was the whole decision; the clean-URL
      question turned out to discriminate almost nothing (Cloudflare Pages,
      Workers static assets, Netlify and GitHub Pages all serve `/pegs` from
      `pegs.html` unconfigured — only Vercel needs a switch). GitHub Pages
      cannot set headers at all, so `dist/_headers` becomes inert; Cloudflare
      reads the file we already emit, `!` directive included, and nobody else
      implements that directive.
- [x] 1.1b **Direct upload, not the Pages GitHub integration** — see
      `design.md` §3b. The integration cannot wait on a GitHub check, so it
      would publish exactly the commits CI exists to catch.
- [n/a] 1.2 If GitHub Pages is chosen, settle **user/org site vs project site**
      first. A project site serves from `/<repo>/`, `base` is unset today, and
      `base` reaches the service worker scope, the manifest and every
      `new URL(…, import.meta.url)`. **A custom domain keeps `base` at `/`** and
      removes this cost entirely, so the realistic GitHub Pages option is
      "custom domain, and you lose the headers".
- [x] 1.3 Record the decision and its cost in `design.md` — including what is
      being given up. Written: the recommendation, the three costs of taking it,
      and an honest accounting of each alternative. **Awaiting the owner's
      choice**, which is what §1.1 is; the file records the recommendation, not
      a decision already taken.

## 2. Publish

- [x] 2.1 Deploy **only on a green gate**. Written into `.github/workflows/ci.yml`
      as a second job with `needs: gate`, so the gate is not duplicated into a
      workflow that could drift from it. **`needs:` propagates the verdict, not
      the bytes**, so per `design.md` §3 the gate job now carries the
      deploy-time environment and uploads its `dist/` as an artifact
      (`if-no-files-found: error`), and the deploy job downloads that artifact
      rather than rebuilding — what ships is what was gated. Publishing is
      `cloudflare/wrangler-action@v4` with a pinned wrangler, `main` only.
- [x] 2.1b Owner created the Pages project and both repository secrets
      (2026-09-07). **The automated path is proved end to end**: run
      `34166272340` on `f1cbfda2` ran the gate to success, the deploy job
      downloaded the gate's own artifact ("Download artifact has finished
      successfully") and published it, and production now serves that build —
      confirmed by `robots.txt`, whose trimmed form exists only in that commit,
      which is evidence rather than inference. Cloudflare re-uploaded 68 of 326
      files and recognized 258 as already present, so the content-addressed
      dedup works across a manual and a CI deploy of the same tree.
- [ ] 2.2 Set the deploy environment. Each of these is currently unset and each
      changes an output:
      - [ ] `VITE_CANONICAL_BASE_URL` — without it **no `sitemap.xml`** and no
            `<link rel=canonical>` on 57 puzzle pages. (`robots.txt` ships
            either way — see 0.4.) The owner's chosen domain is
            **`hintful.click`** (2026-09-03; unregistered on the day, checked
            against the registry's RDAP with `nic.click` as the control), so
            this becomes `https://hintful.click/` once bought and pointed at the
            host. **The first deploy does not wait on this**: on Cloudflare,
            `puzzles-ts.pages.dev` is a working HTTPS origin immediately, and
            the emitted `_headers` already `noindex`es it. Ship there, unblock
            4.6, and add the canonical URL when the domain lands.
      - [ ] `VITE_APP_NAME` — optional: the default is the product name from
            `src/project-identity.ts` ("Hintful Puzzles"), so set it only to
            brand a deployment differently.
      - [ ] `VITE_GIT_SHA` / `VITE_APP_VERSION` — so a report from a phone names
            a build. Both default sensibly under `actions/checkout` (the git dir
            is present, so `git rev-parse HEAD` works); set them only to pin.
      - [ ] `VITE_SENTRY_DSN` — a real decision, not a checkbox: it widens
            `connect-src` and turns on `Accept-CH` client hints. The repo's
            "let unrecoverable errors reach Sentry" rule has teeth for the first
            time once there is a public URL. **It is not a secret** — a
            client-side DSN is compiled into a public bundle and readable out of
            `dist/assets/`. The real controls are Sentry's allowed-domains list
            and rate limits, set in Sentry. Do not mistake a CI secret for one.
- [ ] 2.3 Translate `_headers` for the chosen host if it does not read that
      format (Netlify: nearly the same file, minus `!`; Render: `render.yaml`;
      Vercel: `vercel.json`). **Translate the cache-control rules too, not only
      the CSP** — `/assets/*` and `/preflight/*` are `immutable` for a year and
      the HTML is not, and getting that backwards ships a stale app that will
      not update. The inversion in 0.1 makes this materially smaller: seven
      rules use the Cloudflare-only `!` directive now, down from 64.
- [ ] 2.4 **Keep the privacy notes true for the deployed build.** The About
      dialog's Privacy panel (`src/assets/privacy.html`, written by
      `claim-project-authorship`, 2026-09-02) promises: no personal information
      collected or stored; games and settings stay in the browser; any
      measurement is anonymous and aggregate with no cookies or client-side
      identifier; crash reports carry the error and the app/browser/screen with
      personal information disabled. Each deploy-time choice here is bound to
      one of those sentences — `VITE_SENTRY_DSN` to the crash-report paragraph
      (`sendDefaultPii: false` must stay; it is set at
      `src/utils/sentry.ts:33`, checked 2026-09-07), `VITE_ANALYTICS_BLOCK` to
      the measurement paragraph (an analytics vendor that sets a cookie or an
      identifier breaks it), and host logging to "stored nowhere else". Check
      each against the notes and amend the notes in the same change if a choice
      contradicts them.

## 3. Fix what the inherited config assumes

- [x] 3.1 The Cloudflare Web Analytics CSP entries — done as 0.6.
- [x] 3.2 Re-read the rest of `securityHeaders()` for other assumptions about a
      host we may not be on. `X-Frame-Options` is done (0.3). **The HSTS
      assumption is now measured rather than inherited**: the comment claimed
      Cloudflare adds its own `Strict-Transport-Security` and `Expect-CT`; the
      deployed origin returns **no HSTS header at all** (2026-09-07). It is a
      per-zone setting and `pages.dev` is not our zone. That costs nothing today
      — `pages.dev` is HTTPS-only and we control no apex on it — so the comment
      is corrected in place and the decision is deferred **to the custom
      domain**, where HSTS is worth having and awkward to reverse. Carried as
      §2.2's domain work rather than left as a standing "still open".

## 4. Verify the deployed artifact, not the local build

Each of these fails **silently**, which is why they are listed rather than left
to a glance at the home page.

**First deploy: `hintful-puzzles.pages.dev`, 2026-09-07, from commit `9ec3f12e`**
(manual `wrangler pages deploy` of the gated build, pending the CI secrets in
2.1b). Everything below was measured against that live origin.

- [x] 4.1 Clean URLs resolve: `/`, `/pegs`, `/solo` and `/help/pegs` all 200 as
      `text/html`; `/help/index` 308s to the directory form; an unknown path
      404s and serves our own `public/404.html` ("Nothing here"). Cloudflare
      needed no configuration for any of it.
- [x] 4.2 **Headers arrive, and every cache class is right** — the two that
      could only be checked here both passed:
      - `/` → `max-age=60`, **not doubled**. Under the old direction `/` needed
        an `!` override, which is exactly what workers-sdk#11351 breaks; the
        inversion means `/` inherits and detaches nothing.
      - `/pegs` → `max-age=60` **with no rule of its own**, which is the whole
        claim of 0.1's inversion, confirmed on the wire.
      - `/assets/<hashed>.js` → `max-age=31556952, immutable`;
        `/favicon.svg` → `max-age=14400`; `/manifest.webmanifest` → 60.
      - `/sw.js` → **plain `no-cache`**, not `public, max-age=60,
        must-revalidate, no-cache`. That is the `!` detach working against an
        inherited value; a comma-joined result would have meant the merge had
        beaten us.
      - CSP, `X-Content-Type-Options`, `Referrer-Policy` and
        `X-Frame-Options: DENY` all present. The CSP names **no** analytics
        origin (0.6), confirmed in the delivered header rather than the source.
      - `X-Robots-Tag: noindex` on both the project origin and the
        `<version>.` deployment alias.
- [x] 4.3 **Service worker registers and the app runs with the network off.**
      Scope is `https://hintful-puzzles.pages.dev/` — root, as `base` is unset.
      285 entries precached, worker `activated`. With
      `context.setOffline(true)` (verified genuinely cut: an uncached `fetch`
      throws), `/pegs` loads from cache and **renders a complete Cross 7×7
      board on a real canvas**. Note for the next reader: a fresh browser tab
      registers **no** worker and that is correct, not a defect —
      `settings.allowOfflineUse ?? isRunningAsApp` (`src/utils/pwa.ts:98`), so
      only an installed app opts in by default. The check has to enable it
      first (Preferences → Advanced → Allow offline use) or it measures nothing.
- [x] 4.4 Manifest serves with `name: "Hintful Puzzles"`, `short_name:
      "Hintful"`, `start_url` and `scope` `/`, `display: standalone`, and the
      two theme colors read out of `theme.css`. All six icons 200 with correct
      content types.
- [x] 4.5 `/sitemap.xml` 404s and `/robots.txt` serves the `public/` placeholder
      — **both correct for a build with no `VITE_CANONICAL_BASE_URL`**, and
      together they confirm 0.4's correction on the wire: one is gated, the
      other is not. Re-check both when the domain lands; `robots.txt` should
      then be the plugin's output naming the sitemap.
- [ ] 4.6 Hand the URL over. `test-touch-on-a-real-device` is blocked on it and
      is where the touch acceptance the input-parity audit could not get
      actually happens. **Do this on the `pages.dev` URL rather than waiting for
      the domain** — it is the whole reason the deploy is urgent.

## 5. Close out

- [x] 5.1 `build-pipeline` spec: four `ADDED` requirements — publishing from a
      green gate with the verification done on the deployed origin, a host that
      cannot deliver the headers being a recorded decision, the CSP granting
      only origins the app loads, and the header rules not growing with the
      catalog.
- [x] 5.2 `AGENTS.md` build-commands section now says where the app lives, that
      nothing is deployed by hand, that `_headers` must stay constant in the
      size of the catalog, that a build's environment changes its output, and
      that a deploy is verified against the deployed origin — including the
      service-worker default that makes a naive offline check measure nothing.
- [x] 5.3 `openspec validate deploy-the-web-app --strict` — passing, and it runs
      in the commit gate on every commit anyway.

**Still open, all tied to the domain rather than to the deploy:** buying
`hintful.click` and setting `VITE_CANONICAL_BASE_URL` (2.2), the
`VITE_SENTRY_DSN` decision (2.2), HSTS at the custom domain (3.2), and the
owner's touch acceptance (4.6). The change stays open until those land; the
publishing pipeline itself is done and proved.
