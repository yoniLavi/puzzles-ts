# build-pipeline Specification Delta — deploy-the-web-app

## ADDED Requirements

### Requirement: The app is published from a green gate, and the publish is verified on the deployed origin

The app SHALL be deployed to a public HTTPS origin, and the deploy SHALL be
gated on `npm run gate` passing for that commit — a build that has not passed
the gate must not reach the URL people use. The publish SHALL reuse CI's gate
job rather than restating it, so the two cannot drift into disagreeing about
what "green" means.

Verification SHALL be performed **against the deployed origin**, not against a
local build, for the four things that fail silently there:

- a route loads by its **clean URL** (`/pegs` served from `pegs.html`) —
  extensionless resolution is host behavior and is a configuration switch on
  some hosts, so it is checked, never assumed;
- the **security headers arrive** as headers, confirmed by inspecting the
  response, not inferred from `dist/_headers` existing in the output;
- the **service worker registers on that origin** and the app opens with the
  network off — registration is scope- and `base`-sensitive, and a local preview
  does not exercise either;
- the **canonical-URL-gated artifacts** (`sitemap.xml`, `robots.txt`) are
  present, since they are emitted only when `VITE_CANONICAL_BASE_URL` is set and
  their absence is invisible.

#### Scenario: A failing gate does not reach the public URL

- **WHEN** a commit lands on `main` whose gate fails
- **THEN** no deploy is published for that commit

#### Scenario: A puzzle route is reachable by its clean URL

- **WHEN** the deployed origin is asked for a puzzle route with no `.html`
  extension
- **THEN** the corresponding page is served

### Requirement: A host that cannot deliver the security headers is a recorded decision

The build emits `dist/_headers` — the Content-Security-Policy, the
cache-control policy for immutable asset paths, and the rest of the security
headers — in the format one specific host reads. A host that cannot set response
headers, or that reads a different format, SHALL NOT be adopted silently: either
the rules are translated into that host's own configuration, or the loss is
stated as a decision with its cost.

The failure this prevents is specific: `_headers` remains present in the build
output whatever host is chosen, so an inert copy of it looks exactly like a
working one. Nothing a visitor can see changes when the CSP stops being
delivered.

The cache-control rules SHALL be translated alongside the CSP when a translation
is needed. Hashed asset paths are `immutable` for a year and the HTML entry
points are not; inverting that ships an app that cannot update itself.

#### Scenario: Adopting a host without header support

- **WHEN** a host is chosen that cannot deliver the emitted headers
- **THEN** the loss is recorded in the change's design with what it costs, and
  the headers are not left looking as though they apply

### Requirement: The content security policy grants only origins the app loads

Every origin named in the CSP SHALL correspond to something the app actually
loads, and an origin that is conditional on configuration SHALL be added
conditionally — as the Sentry origin is added only when `VITE_SENTRY_DSN` is
set.

This is not hypothetical tidiness. The policy inherited from the upstream fork
grants `https://static.cloudflareinsights.com` a `script-src` and
`https://cloudflareinsights.com` a `connect-src` unconditionally, for an
analytics vendor this fork has not chosen and does not load. A policy that
whitelists an unused third-party script origin is strictly weaker than one that
does not, for no benefit.

#### Scenario: An unused vendor origin is not whitelisted

- **WHEN** the app is built with no analytics block configured
- **THEN** the emitted CSP names no analytics vendor origin

### Requirement: The emitted header rules do not grow with the catalog

The `_headers` file the build emits SHALL contain a number of rules that does
not depend on how many puzzles the catalog holds, and the build SHALL fail if
the rendered file exceeds the host's rule limit.

The limit is a parser limit rather than a quota — Cloudflare reads at most 100
rules, identically on Pages and on Workers static assets and identically on
every plan — so it cannot be raised by migrating or by paying, and rules past it
are dropped with no error and no visible change. A file carrying one rule per
puzzle entry page therefore converts that parser limit into a limit on the
number of **games**, which is a constraint the collection must never acquire by
accident.

Nothing about a cache policy depends on the size of the catalog. Where a broad
rule and a narrow rule would otherwise merge, the broad rule SHALL carry the
value the many paths want and the few exceptions SHALL detach and replace it,
rather than the reverse — which is what makes the per-page rule unnecessary.

The rule count SHALL be asserted by the build rather than recorded in a comment,
and the assertion SHALL carry a vacuity guard, since a render producing no rules
would otherwise satisfy a limit check while measuring nothing.

#### Scenario: A build whose header rules would be silently truncated

- **WHEN** the rendered `_headers` file contains more rules than the host will
  parse
- **THEN** the build fails, naming the count and the limit

#### Scenario: Adding a puzzle does not add a header rule

- **WHEN** a puzzle is added to the catalog
- **THEN** the number of rules in the emitted `_headers` file is unchanged
