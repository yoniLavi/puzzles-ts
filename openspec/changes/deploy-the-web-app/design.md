# Design — deploy-the-web-app

## Decision 1: the `_headers` rule budget, settled before the host is

**This came first because it is a defect on every candidate host, and because
it was the reason to think a host choice might have to be revisited later.**

Cloudflare parses at most **100 rules** out of a `_headers` file. That number is
the same on Cloudflare Pages and on Workers static assets, and it is the same on
every plan — it is a parser limit, not a quota, so **neither migrating to
Workers nor paying raises it**. Rules past the limit are dropped silently: the
file still ships, the site still serves, and the policy simply stops applying to
whatever fell off the end.

The emitted file was **71 rules at 57 puzzles**, because it carried one rule per
puzzle entry page. That made a parser limit into a limit on the number of
**games** — the cap would have been reached at around 88 — which is a direct
collision with the project's stated direction of dozens more games.

**The coupling was an artifact of which way round the default ran, and nothing
to do with the catalog.** Cloudflare merges the headers of every rule a request
matches, and a header named twice is comma-joined; `! Cache-Control` detaches
the inherited value so a narrow rule can replace rather than append. The
inherited template defaulted `/*` to the **long** cache, which made every
**short**-cached path an override — and the short-cached paths are the entry
pages, one per game.

**Inverting the default removes the coupling entirely.** `/*` now carries the
short cache the entry pages want, and the few paths wanting a long one detach
it. `/`, `/pegs` and `/help/*` need no rule at all, because inheriting is
already the right answer. The file is **ten rules and stays ten**, whatever the
catalog does.

Two things fell out of the inversion:

- It steps around **cloudflare/workers-sdk#11351** (open as of 2026-09-07),
  where `!` fails to detach on the root path `/` and the response carries both
  values. That bug is why the broad default sat commented out in the template
  for so long. Under the old direction `/` needed exactly that override; under
  this one `/` is the default and detaches nothing.
- It makes a future translation to another host **easier**, not harder: the
  count of rules using the Cloudflare-only `!` directive drops from 64 to 7.

**The budget is asserted, not written down.** `checkHeaderRuleBudget` in
`vite.config.ts` counts the rendered rules and fails `vite build`, which is in
the commit gate. It carries a vacuity guard ("how many rules did I look at?"),
because an empty render would otherwise sail through a `> 100` check while
asserting nothing. Both branches were proved to fail before being trusted.

## Decision 2: the host

**Recommended: Cloudflare Pages, published by direct upload from CI.**

The deciding property is not that the repo is already configured for Cloudflare
— that is a sunk cost and not an argument. It is that **`! Cache-Control` has no
equivalent anywhere else**, and the whole cache policy is built on it: hashed
assets immutable for a year, HTML entry points at sixty seconds. Every other
host means restating that policy in a foreign format, and `tasks.md` §2.3 is
right that inverting it ships an app that cannot update itself.

Checked against the free tier, 2026-09-07:

| | this build | Cloudflare Pages free |
| --- | --- | --- |
| files in `dist/` | 327 | 20,000 |
| largest file | 7.3 MB (a worker sourcemap) | 25 MiB |
| `_headers` rules | 10 | 100 |
| bandwidth | — | unmetered |

Cloudflare is also the only candidate with no bandwidth cap; Netlify, Render and
Vercel free tiers are 100 GB/month.

Two consequences worth having on purpose:

- **`puzzles-ts.pages.dev` is a working HTTPS origin on day one**, and the
  emitted `_headers` already carries `X-Robots-Tag: noindex` for it. So the
  first deploy **does not wait on buying `hintful.click`** — which matters,
  because the thing actually blocked is `test-touch-on-a-real-device`, and it
  needs a URL, not a domain.
- **Cloudflare Registrar** sells `.click` at wholesale with no renewal markup,
  putting the domain, DNS and host in one account when the domain is bought.

### What this gives up, stated rather than left implied

1. **Vendor consolidation** on Cloudflare — host, DNS, registrar, and analytics
   if it is ever adopted.
2. **Pages is no longer where Cloudflare points new projects.** As of 2026 the
   greenfield recommendation is Workers with static assets; Pages is fully
   supported with no forced-migration deadline, and Workers static assets reads
   the same `_headers` file, so the escape hatch is real and cheap. This fork
   *is* greenfield, so choosing Pages is knowingly choosing the older of two
   supported products. It is chosen because it needs no `wrangler.jsonc`, no
   `html_handling`, and no `not_found_handling: "404-page"` — all of which
   Workers requires configuring to reproduce what Pages does by default. If a
   reason to move appears, the `_headers` file moves unchanged.
3. **It is a free tier.** No SLA.

### The alternatives, and what each actually costs

- **Netlify** — the runner-up, and the one an earlier draft of the proposal
  overlooked entirely in favor of Render. Its `_headers` is the same file
  format, including `:placeholder` and `*`; only the `!` detach is missing, so
  the translation is a handful of rules rather than a rewrite. 100 GB/month.
- **Render / Vercel** — both mean restating the entire header and cache policy
  in `render.yaml` or `vercel.json`. Vercel additionally needs `cleanUrls: true`
  (off by default) and its Hobby tier is non-commercial only.
- **GitHub Pages** — **cheaper than an earlier draft implied, and worth stating
  accurately.** It serves `/pegs` from `pegs.html` with no configuration, so
  that is not a cost. The costs are: no response headers at all, so the CSP,
  `X-Content-Type-Options` and the cache policy stop existing (`_headers` sits
  inert in the output looking exactly like a working file); and — if a *project*
  site is used — `base` becomes `/puzzles-ts/`, which reaches the service worker
  scope, the manifest and every `new URL(…, import.meta.url)`. A **custom domain
  keeps `base` at `/`** and removes that second cost entirely, so the honest
  form of the GitHub Pages option is "custom domain, and you lose the headers".
  The concrete harm of losing them is narrower than "no security": the app loads
  no third-party scripts and has no user-generated content, so the CSP is
  defense in depth rather than an active control, and GitHub Pages' own
  `max-age=600` on everything is a cache policy you did not choose rather than
  no cache policy. It is still a real loss and still the reason to prefer
  Cloudflare — but it is a loss to weigh, not a disqualification.

## Decision 3: which build is deployed

`tasks.md` §2.1 says to deploy only on a green gate and to reuse `ci.yml`'s job
via `needs:`. That is the right instinct but it does not do what the sentence
implies, and the gap is worth naming because it is the same silent-drop class as
everything else here.

**The gate's `vite build` runs with no deploy environment, so its `dist/` is not
the artifact anyone would publish.** With `VITE_SENTRY_DSN` unset the CSP has no
Sentry origin, no `Accept-CH` and no `Permissions-Policy`; with
`VITE_CANONICAL_BASE_URL` unset there is no sitemap and no `<link rel=canonical>`
on 57 pages. `needs:` propagates the verdict, not the bytes.

**Decision: the gate job builds with the production environment and uploads
`dist/` as an artifact; the deploy job downloads that artifact and uploads it.**
The alternative — a deploy job that rebuilds — is simpler and materially weaker:
"deployed only from a green gate" would then mean "deployed from a build that
resembles one that passed", and a header could differ with nothing to notice.
The cost of the chosen form is one `actions/upload-artifact` step.

## Decision 4: the CSP names no analytics vendor

Removed rather than made conditional. The reasoning is in `proposal.md` and in
the comment at the site in `vite.config.ts`; the short form is that there is no
honest conditional form for a vendor nobody has chosen, because Cloudflare's
beacon posts to an origin that appears nowhere in its own script tag, so gating
those two literals on a generic `VITE_ANALYTICS_BLOCK` would hardcode one
vendor's answer behind a name promising any vendor.

Adopting analytics later is a product decision that adds its own origins in its
own change. It would need no amendment to `src/assets/privacy.html`, whose
Measurement paragraph already describes a cookieless, identifier-free,
aggregate-only vendor.
