# deploy-the-web-app

## Why

**Nothing this fork has built is reachable from a phone.** The app has never
been deployed anywhere: `.github/workflows/ci.yml` runs the gate on push to
`main` and stops, and there is no publish step, no host, and no URL.

That is now blocking acceptance rather than merely deferring it.
`2026-08-29-audit-input-mode-parity` repaired a touch defect in seven games —
a held finger silently destroying the gesture, Pegs' whole interaction among
them — and the owner cannot accept it: *"I can't actually test and accept touch
here on my dev machine. We need to deploy it so I could then connect with my
phone."* Every touch fix from here on has the same shape, and so does the whole
PWA half of the product (install, offline, the service worker), none of which a
`vite preview` on a laptop exercises honestly.

**The repo already has a host baked into it, and it is not one of the three
under discussion.** This is the finding that should shape the decision:

- **`dist/_headers` is a live build output**, rendered from
  `templates/_headers.txt.hbs`, carrying the Content-Security-Policy, the
  cache-control policy for `/assets/*` and `/preflight/*`, and the rest of the
  security headers. Its `/:file.png` placeholder syntax is **Cloudflare's**, not
  Netlify's.
- **The CSP hard-codes Cloudflare Web Analytics** —
  `https://static.cloudflareinsights.com` in `script-src` and
  `https://cloudflareinsights.com` in `connect-src`, unconditionally, with no
  `VITE_ANALYTICS_BLOCK` set. The comments beside it describe Cloudflare's own
  default headers.

All of it is inherited from `medmunds/puzzles-web`, which deployed to Cloudflare
Pages. This fork has never chosen a host, so it has been carrying one by
default — and the CSP has been granting an analytics vendor we do not use a
script origin, which is a small live defect this change should fix either way.

**The consequence for the choice is concrete, and it is not about price or
polish.** Static hosts differ on exactly two things this app depends on:

1. **Can the host set response headers?** **GitHub Pages cannot, at all.** Deploy
   there and `_headers` becomes an inert file in the output: no CSP, no
   cache-control policy, no `X-Content-Type-Options`. The app still works, and
   the security posture the repo deliberately built silently stops existing.
   Vercel needs the rules restated in `vercel.json`; Render needs them in
   `render.yaml` or its dashboard; Cloudflare Pages reads the file we already
   emit, verbatim.
2. **Does the host serve `/pegs` from `pegs.html`?** The build emits **one real
   HTML file per route** (`vite-plugins/extra-pages.ts`, "clean URLs: `/foo` →
   `foo.html`") — 57 puzzle pages plus the help tree. Extensionless resolution is
   host behavior, and it is a config switch on at least one candidate
   (Vercel's `cleanUrls`, off by default). **Verify it on the host, do not assume
   it**; a wrong assumption here is a 404 on every puzzle.

A third thing to settle before picking, not after: **a GitHub Pages *project*
site serves from `/<repo>/`**, and `base` is unset in `vite.config.ts` (so `/`).
A subpath deploy therefore needs `base`, and `base` interacts with the service
worker's scope, the PWA manifest, and every `new URL(…, import.meta.url)` the
asset-integrity test already guards. A user/org site or a custom domain avoids
the whole question. **This is a cost of GitHub Pages specifically, and it is
easy to discover late.**

## What Changes

**The host is the owner's call** (it changes a URL people will bookmark, and it
may cost money), so this change presents the comparison and then implements the
chosen one. The recommendation, on the evidence above, is **Cloudflare Pages** —
because the repo is already configured for it and the alternative is translating
a CSP by hand — with **Render** the strongest of the three named if a fresh
choice is preferred, and **GitHub Pages** the one to take only knowing it drops
the headers.

- **Decide the host**, with the header question and the clean-URL question
  answered *on that host* rather than from documentation.
- **Add a publish step**, triggered on a green gate rather than beside it: a
  deploy of a build that has not passed `npm run gate` is a worse outcome than no
  deploy. Reuse `.github/workflows/ci.yml`'s job rather than duplicating the
  gate.
- **Set the deploy-time environment**, which is presently unset and which several
  build outputs are gated on:
  - `VITE_CANONICAL_BASE_URL` — **without it there is no `sitemap.xml` and no
    `robots.txt`** (the plugin is skipped entirely; `vite.config.ts` says the
    output would be meaningless anyway).
  - `VITE_APP_NAME` — otherwise the PWA manifest installs as "Puzzles web app".
  - `VITE_GIT_SHA` / `VITE_APP_VERSION` — so a bug report from a phone names a
    build.
  - `VITE_SENTRY_DSN` — **optional and consequential**: setting it adds the
    Sentry origin to `connect-src` and turns on `Accept-CH` client hints. Decide
    deliberately; the repo's rule that unrecoverable errors must reach Sentry
    argues for it, and a public URL is the first time that rule has teeth.
- **Fix the inherited Cloudflare Analytics CSP entries** — remove them if we are
  not using that analytics, or make them conditional on
  `VITE_ANALYTICS_BLOCK` the way the Sentry origin is conditional on its DSN. A
  CSP granting a script origin nobody loads is a weaker CSP for no benefit, and
  it is *wrong* on any host but one.
- **Verify the deployed artifact, not the local build.** At minimum: a puzzle
  route loads by clean URL; the service worker registers and the app opens
  offline; the manifest installs; the CSP header actually arrives (or is
  recorded as absent by choice); `/sitemap.xml` and `/robots.txt` exist.

## Impact

- **Affected specs**: `build-pipeline` — it currently documents CI as the whole
  of the automation story ("Continuous integration runs the full gate on push to
  main"), and publishing is a second obligation with its own rules.
- **Affected code**: `.github/workflows/` (a publish job or workflow), the host's
  config file if it needs one, `vite.config.ts`'s `securityHeaders` for the
  analytics entries, and possibly `base`.
- **Player-visible**: it is the *first* thing visible to anyone who is not the
  owner. A URL, once shared, is hard to move.
- **Risk**: the failure mode to avoid is a deploy that looks fine and quietly
  drops a header, a route, or the service worker. Each of the four verifications
  above exists because it fails silently — a missing CSP header changes nothing
  a visitor can see, and neither does a service worker that never registered
  until the day the network is gone.
