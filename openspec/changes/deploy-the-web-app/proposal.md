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
  security headers. **The Cloudflare-only part of it is the `! Cache-Control`
  detach syntax**, plus the two `https://:project.pages.dev/*` full-URL rules.
  (An earlier draft of this proposal cited `/:file.png` as the proprietary
  tell. That is wrong: Netlify's `_headers` supports `:placeholder` at the start
  of a path segment too. Same conclusion, but the evidence has to be the line
  that is actually proprietary — the detach directive no other host implements,
  which is what the whole cache policy is built on.)
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
   host behavior. **This turns out to discriminate almost nothing** (checked
   2026-09-07): Cloudflare Pages, Cloudflare Workers static assets, Netlify
   *and* GitHub Pages all resolve `/pegs` to `pegs.html` with no configuration.
   **Vercel is the only candidate where it is a switch** (`cleanUrls`, off by
   default). An earlier draft made this one of two decisive questions and used
   it as evidence against GitHub Pages; it is not evidence against anything but
   Vercel. It still gets verified on the host per §4 — the point of that list is
   that these things fail silently — but it does not shape the choice.

A third thing to settle before picking, not after: **a GitHub Pages *project*
site serves from `/<repo>/`**, and `base` is unset in `vite.config.ts` (so `/`).
A subpath deploy therefore needs `base`, and `base` interacts with the service
worker's scope, the PWA manifest, and every `new URL(…, import.meta.url)` the
asset-integrity test already guards. A user/org site or a custom domain avoids
the whole question. **This is a cost of GitHub Pages specifically, and it is
easy to discover late.**

A fourth thing, found while reviewing this proposal (2026-09-07) and **fixed
ahead of the host decision because it is a defect on every host**: the emitted
`_headers` carried **one rule per puzzle entry page**, and Cloudflare parses at
most **100 rules** — the same 100 on Pages and on Workers static assets, on
every plan, so neither migrating nor paying raises it. At 57 puzzles the file
was 71 rules; it would have reached the cap at around 88 games, and the rules
past the cap are dropped **silently**. The coupling was an artifact of which way
round the cache default ran, not anything about the catalog; inverting it (see
`design.md`) makes the file **ten rules, constant in the number of games**, and
a build-time check now fails `vite build` if a future edit reintroduces a
per-page rule.

## What Changes

**The host is the owner's call** (it changes a URL people will bookmark, and it
may cost money), so this change presents the comparison and then implements the
chosen one. The recommendation, on the evidence above, is **Cloudflare Pages** —
not because the repo is already configured for it, which is a sunk cost, but
because it is the only candidate that reads the `!` detach directive the cache
policy is built on. **Netlify**, not Render, is the runner-up: its `_headers` is
the same file format bar the detach, so the translation is a handful of rules
rather than a rewrite into YAML or JSON. **GitHub Pages** remains available at a
cost that is real but smaller than an earlier draft implied — see `design.md`,
which records the decision, the alternatives and what each one gives up.

- **Decide the host**, with the header question and the clean-URL question
  answered *on that host* rather than from documentation.
- **Add a publish step**, triggered on a green gate rather than beside it: a
  deploy of a build that has not passed `npm run gate` is a worse outcome than no
  deploy. Reuse `.github/workflows/ci.yml`'s job rather than duplicating the
  gate.
- **Set the deploy-time environment**, which is presently unset and which several
  build outputs are gated on:
  - `VITE_CANONICAL_BASE_URL` — **without it there is no `sitemap.xml`**, and no
    `<link rel=canonical>` on any of the 57 puzzle pages (the plugin is skipped
    entirely; `vite.config.ts` says the output would be meaningless anyway).
    **`robots.txt` is not gated on it** and never was: `public/robots.txt` is
    copied on every build, and the sitemap plugin overwrites it only when the
    variable is set. An earlier draft said both were gated; the file's own body
    said so too, and so did an entry in `precache-coverage.ts`. All three have
    been corrected — one stale claim had propagated to three places, which is
    the argument for checking a build output rather than reading about it.
  - `VITE_APP_NAME` — optional; the manifest defaults to the product name in
    `src/project-identity.ts` ("Hintful Puzzles").
  - `VITE_GIT_SHA` / `VITE_APP_VERSION` — so a bug report from a phone names a
    build.
  - `VITE_SENTRY_DSN` — **optional and consequential**: setting it adds the
    Sentry origin to `connect-src` and turns on `Accept-CH` client hints. Decide
    deliberately; the repo's rule that unrecoverable errors must reach Sentry
    argues for it, and a public URL is the first time that rule has teeth.
    **It is not a secret**, whatever it is stored in: a client-side DSN is
    compiled into a public bundle by construction, and anyone can read it out
    of `dist/assets/`. The controls that do something are Sentry's own
    allowed-domains list and rate limits, configured in Sentry. Storing it as a
    CI secret is tidiness, not a control, and must not be mistaken for one.
- **Remove the inherited Cloudflare Analytics CSP entries** — done 2026-09-07.
  A CSP granting a script origin nobody loads is a weaker CSP for no benefit,
  and it is *wrong* on any host but one. **Removed rather than made conditional
  on `VITE_ANALYTICS_BLOCK`**: that block is arbitrary html for a vendor nobody
  has chosen, and Cloudflare's beacon posts to an origin appearing nowhere in
  its own script tag — so a "conditional" form would have hardcoded one
  vendor's two literals behind a flag named for any vendor, which is a lie
  waiting to be read. Whichever change turns analytics on adds the origins it
  needs, in the same change that adds the block.
  That this is a **separate product decision** rather than a CSP cleanup is the
  point. Cloudflare Web Analytics is free, cookieless, keeps no client-side
  state and does not fingerprint — which is already what
  `src/assets/privacy.html` § Measurement promises, so adopting it later would
  need no amendment to the privacy notes. Adopting it is simply not this change.
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
