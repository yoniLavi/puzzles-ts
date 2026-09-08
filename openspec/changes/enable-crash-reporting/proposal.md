# enable-crash-reporting

## Why

**`AGENTS.md` says unrecoverable errors must reach Sentry — and none of them
do.** The rule is stated as a constraint ("Catch unrecoverable errors only to
log them — let them propagate so Sentry records them"), the client is wired
(`src/utils/sentry.ts`), the CSP knows how to widen for it, and the build reads
`VITE_SENTRY_DSN`. That variable has never been set, so the rule has been
enforced against nothing.

It had no teeth before, which is why nobody minded: with no deployment there was
no one to have a crash. That changed on 2026-09-08. The app is public, it is
installable, and the very first outside session produced a real failure — the
stale-chunk crash on the About dialog — which reached the owner only because
they read the error text off their own phone and typed it into a chat. That is
the reporting channel today.

**This is split out of `deploy-the-web-app` deliberately.** It was the one item
that change could not close, and it is not a leftover chore: it is a decision
about what the app sends to a third party, bound to a paragraph of the privacy
notes that players can read. Left as an unchecked box inside a shipped deploy it
would have looked like an oversight; it is a question.

## What Changes

**The decision, which is the owner's:** turn crash reporting on, or record that
it stays off and why. Both are legitimate. What is not legitimate is the current
state — a rule in `AGENTS.md` that describes behavior the build does not have.

If it goes on:

- **Create a Sentry project and set `VITE_SENTRY_DSN`** on the gate job, beside
  `VITE_CANONICAL_BASE_URL`. Both are read by the build that gets published.
- **The DSN is not a secret**, whatever it is stored in: a client-side DSN is
  compiled into a public bundle and readable out of `dist/assets/`. Storing it
  as a CI secret is tidiness. The controls that do something are **Sentry's
  allowed-domains list and its rate limits**, configured in Sentry, and this
  change SHALL set both — an unrestricted public DSN is an invitation to have
  someone else's errors billed to you.
- **Two headers appear when it is set**, and neither is obvious from the
  variable's name: the Sentry origin is added to `connect-src`, and `Accept-CH`
  plus `Permissions-Policy` turn on high-entropy client hints
  (`Sec-CH-UA-Platform-Version`, `-Full-Version-List`, `-Model`). Client hints
  are a fingerprinting surface, so **decide them separately from the DSN** —
  they are a convenience for reading stack traces, not a requirement.
- **`sendDefaultPii: false` must stay** (`src/utils/sentry.ts:33`). The privacy
  notes promise "personal information is switched off in the reporting on
  purpose", and that line is the flag.
- **Verify against the deployed origin**, per the `build-pipeline` requirement:
  the CSP actually names the Sentry origin, a deliberately thrown error actually
  arrives, and the payload carries no more than the notes describe.

If it stays off, the `AGENTS.md` rule is amended to say so, so the next reader
does not implement against a promise the project has declined.

## Impact

- **Affected specs**: `build-pipeline` — the deploy-time environment gains a
  requirement about what turning reporting on obliges.
- **Affected code**: the CI workflow's `env` block; possibly
  `vite.config.ts`'s client-hints block if those are declined separately from
  the DSN; `AGENTS.md` if the answer is no.
- **Player-visible**: only through the privacy notes, which must stay true
  either way. Nothing on screen changes.
- **Sends data to a third party**, which is why it is the owner's call and not
  an implementation detail.
