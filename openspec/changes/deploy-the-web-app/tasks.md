# Tasks — deploy-the-web-app

## 1. Choose the host (owner's call — do not pick one silently)

- [ ] 1.1 Put the comparison to the owner with the two decisive questions
      answered, not the marketing pages: **can it set response headers**, and
      **does it serve `/pegs` from `pegs.html`**. The proposal's evidence:
      GitHub Pages cannot set headers at all, so `dist/_headers` becomes inert;
      Cloudflare Pages reads the file we already emit.
- [ ] 1.2 If GitHub Pages is chosen, settle **user/org site vs project site**
      first. A project site serves from `/<repo>/`, `base` is unset today, and
      `base` reaches the service worker scope, the manifest and every
      `new URL(…, import.meta.url)`. Decide before deploying, not after the
      first 404.
- [ ] 1.3 Record the decision and its cost in `design.md` — including what is
      being given up. If it is the headers, say so in one sentence rather than
      letting the `_headers` file sit in `dist/` looking like it works.

## 2. Publish

- [ ] 2.1 Deploy **only on a green gate**. Reuse `ci.yml`'s job (`needs:`), do
      not duplicate the gate into a second workflow where the two can drift.
- [ ] 2.2 Set the deploy environment. Each of these is currently unset and each
      changes an output:
      - [ ] `VITE_CANONICAL_BASE_URL` — without it **no `sitemap.xml` and no
            `robots.txt` are emitted at all**; the plugin is skipped.
      - [ ] `VITE_APP_NAME` — or the installed PWA is called "Puzzles web app".
      - [ ] `VITE_GIT_SHA` / `VITE_APP_VERSION` — so a report from a phone names
            a build.
      - [ ] `VITE_SENTRY_DSN` — a real decision, not a checkbox: it widens
            `connect-src` and turns on `Accept-CH` client hints. The repo's
            "let unrecoverable errors reach Sentry" rule has teeth for the first
            time once there is a public URL.
- [ ] 2.3 Translate `_headers` for the chosen host if it does not read that
      format (Vercel: `vercel.json`; Render: `render.yaml`). **Translate the
      cache-control rules too, not only the CSP** — `/assets/*` and
      `/preflight/*` are `immutable` for a year and the HTML is not, and getting
      that backwards ships a stale app that will not update.

## 3. Fix what the inherited config assumes

- [ ] 3.1 **The CSP hard-codes Cloudflare Web Analytics** —
      `https://static.cloudflareinsights.com` in `script-src`,
      `https://cloudflareinsights.com` in `connect-src`, unconditionally.
      Nothing loads them (`VITE_ANALYTICS_BLOCK` is unset). Remove them, or make
      them conditional on the analytics block exactly as the Sentry origin is
      conditional on its DSN. A CSP granting an origin nobody uses is weaker for
      no benefit.
- [ ] 3.2 Re-read the rest of `securityHeaders()` for other assumptions about a
      host we may not be on — its comments describe Cloudflare's *own* default
      `Strict-Transport-Security` and `Expect-CT`, which another host may not
      add. If HSTS matters, it becomes ours to set.

## 4. Verify the deployed artefact, not the local build

Each of these fails **silently**, which is why they are listed rather than left
to a glance at the home page.

- [ ] 4.1 A puzzle route loads by clean URL (`/pegs`), and so does a help page.
      Check more than one, and check `/` and a 404.
- [ ] 4.2 The **CSP header actually arrives** — `curl -I` the deployed URL, do
      not infer it from `dist/_headers` existing. If the host cannot set it,
      confirm that is the recorded decision from task 1.3 rather than a surprise.
- [ ] 4.3 The service worker **registers on the deployed origin** and the app
      opens with the network off. Registration is scope-sensitive and
      `base`-sensitive; a laptop `vite preview` does not prove it.
- [ ] 4.4 The manifest installs, with the intended name and icons.
- [ ] 4.5 `/sitemap.xml` and `/robots.txt` exist — they are gated on
      `VITE_CANONICAL_BASE_URL` and are the easiest thing here to leave out and
      never notice.
- [ ] 4.6 Hand the URL over. `test-touch-on-a-real-device` is blocked on it and
      is where the touch acceptance the audit could not get actually happens.

## 5. Close out

- [ ] 5.1 `build-pipeline` spec: publishing as its own requirement, including
      the green-gate precondition and whatever the host decision costs.
- [ ] 5.2 `AGENTS.md` build-commands section: it currently ends at
      `npm run preview`. Say where the app lives and how it gets there.
- [ ] 5.3 `openspec validate deploy-the-web-app --strict`.
