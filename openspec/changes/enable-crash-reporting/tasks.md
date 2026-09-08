# Tasks — enable-crash-reporting

## 1. The decision (owner's — this is the whole change)

- [ ] 1.1 Crash reporting on, or deliberately off? Both are fine; the current
      state is not, because `AGENTS.md` states a rule the build does not
      implement. If the answer is **off**, do only 4.1 and stop.
- [ ] 1.2 If on: **client hints separately.** Setting the DSN also turns on
      `Accept-CH` and `Permissions-Policy` for `Sec-CH-UA-Platform-Version`,
      `-Full-Version-List` and `-Model`. Those are a fingerprinting surface
      requested for the convenience of reading stack traces, not a requirement
      of error reporting. Decide them on their own merits rather than inheriting
      them with the DSN.

## 2. If on: turn it on

- [ ] 2.1 Create the Sentry project. Set **allowed domains** to `hintful.click`
      (and `hintful-puzzles.pages.dev` if preview deployments should report) and
      set a **rate limit**. The DSN is public by construction — compiled into
      the bundle, readable from `dist/assets/` — so these two settings are the
      only things standing between the project and someone else's traffic.
- [ ] 2.2 Add `VITE_SENTRY_DSN` to the gate job's `env` in
      `.github/workflows/ci.yml`, beside `VITE_CANONICAL_BASE_URL`. It must be
      on the **gate** job, not the deploy job: the deploy publishes the gate's
      artifact and does not build.
- [ ] 2.3 Confirm `sendDefaultPii: false` is still set
      (`src/utils/sentry.ts:33`). The privacy notes promise it in words.

## 3. If on: verify on the deployed origin

The `build-pipeline` requirement is explicit that a deploy is checked where it
runs, and every item here fails silently.

- [ ] 3.1 `curl -I https://hintful.click/` — the CSP's `connect-src` names the
      Sentry origin, and `Accept-CH` is present or absent per 1.2.
- [ ] 3.2 Throw a deliberate error in the deployed app and confirm it **arrives
      in Sentry**. A DSN that is set but wrong looks exactly like an app that
      never crashes.
- [ ] 3.3 Read one real payload against `src/assets/privacy.html`: the error,
      the app version, the browser and the screen — and nothing else. If it
      carries more, amend the notes **in this change** or turn the extra off.

## 4. Either way: close the gap between the rule and the build

- [ ] 4.1 `AGENTS.md` currently says "Catch unrecoverable errors only to log
      them — let them propagate so Sentry records them." If reporting stays off,
      say so there, so the next reader does not write code against a promise the
      project has declined. If it goes on, the rule is finally true and needs no
      change.
- [ ] 4.2 `build-pipeline` spec delta for whichever way it went.
- [ ] 4.3 `openspec validate enable-crash-reporting --strict`.
