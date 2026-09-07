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

- [ ] 1.1 Put the comparison to the owner. **The header question is the whole
      decision**; the clean-URL question turned out to discriminate almost
      nothing (Cloudflare Pages, Workers static assets, Netlify and GitHub Pages
      all serve `/pegs` from `pegs.html` unconfigured — only Vercel needs a
      switch). GitHub Pages cannot set headers at all, so `dist/_headers`
      becomes inert; Cloudflare reads the file we already emit, `!` directive
      included, and nobody else implements that directive.
- [ ] 1.2 If GitHub Pages is chosen, settle **user/org site vs project site**
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

- [ ] 2.1 Deploy **only on a green gate**. Reuse `ci.yml`'s job (`needs:`), do
      not duplicate the gate into a second workflow where the two can drift.
      **`needs:` propagates the verdict, not the bytes** — the gate's
      `vite build` runs with no deploy environment, so its `dist/` differs from
      any publishable one (no Sentry origin in the CSP, no sitemap, no
      canonical links). Per `design.md` §3: the gate job builds **with** the
      production environment and uploads `dist/` as an artifact; the deploy job
      downloads that artifact rather than rebuilding, so what shipped is what
      was gated.
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
- [ ] 3.2 Re-read the rest of `securityHeaders()` for other assumptions about a
      host we may not be on. `X-Frame-Options` is done (0.3). Still open: the
      comments describe Cloudflare's *own* default `Strict-Transport-Security`
      and `Expect-CT`, which another host may not add. If HSTS matters, it
      becomes ours to set — and on a custom domain it is a commitment that is
      awkward to reverse, so decide it with the domain rather than after.

## 4. Verify the deployed artifact, not the local build

Each of these fails **silently**, which is why they are listed rather than left
to a glance at the home page.

- [ ] 4.1 A puzzle route loads by clean URL (`/pegs`), and so does a help page.
      Check more than one, and check `/` and a 404 (`public/404.html` is the
      page both Cloudflare and GitHub Pages serve for a miss).
- [ ] 4.2 The **CSP header actually arrives** — `curl -I` the deployed URL, do
      not infer it from `dist/_headers` existing. If the host cannot set it,
      confirm that is the recorded decision from 1.3 rather than a surprise.
      **Check a path from each cache class too**, not just `/`: the whole point
      of 0.1's inversion is that `/pegs` now *inherits* rather than declaring,
      so confirm `/pegs` carries `max-age=60` and `/assets/<hashed>` carries
      `immutable`. An inherited value is exactly the kind that looks fine in the
      file and never arrives.
- [ ] 4.3 The service worker **registers on the deployed origin** and the app
      opens with the network off. Registration is scope-sensitive and
      `base`-sensitive; a laptop `vite preview` does not prove it.
- [ ] 4.4 The manifest installs, with the intended name and icons.
- [ ] 4.5 **`/sitemap.xml` exists** (gated on `VITE_CANONICAL_BASE_URL`, and the
      easiest thing here to leave out and never notice) **and `/robots.txt` says
      what it should** — it ships either way, so the check is its *content*, not
      its presence: with the canonical URL set it should be the plugin's output
      naming the sitemap, not the placeholder from `public/`.
- [ ] 4.6 Hand the URL over. `test-touch-on-a-real-device` is blocked on it and
      is where the touch acceptance the input-parity audit could not get
      actually happens. **Do this on the `pages.dev` URL rather than waiting for
      the domain** — it is the whole reason the deploy is urgent.

## 5. Close out

- [ ] 5.1 `build-pipeline` spec: publishing as its own requirement, including
      the green-gate precondition and whatever the host decision costs.
- [ ] 5.2 `AGENTS.md` build-commands section: it currently ends at
      `npm run preview`. Say where the app lives and how it gets there.
- [ ] 5.3 `openspec validate deploy-the-web-app --strict`.
