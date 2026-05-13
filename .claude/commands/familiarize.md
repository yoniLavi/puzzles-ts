Hi,

A few notes to keep this efficient:

- `AGENTS.md` is already in your context (loaded automatically as `CLAUDE.md` — it's a symlink to the same file). Don't re-read it.
- Read the README, and skim the most recent commits and any scoped work in `openspec/changes/`. The task you'll be assigned might not be related to recent activity. Note: `openspec/changes/` is often empty between seams — that's a normal state, not a red flag.
- Read-only filesystem + git status/show/log only. Do not run `npm`, build, test, lint, or check commands; we have extensive pre-commit testing and you can generally trust that if the staging area is clean, the tests pass.

Once you're done, respond with a short readiness signal (~3–5 lines): where things are, any concerns about repo state, and a question if you have one — not a full repo brief, since I already know what's in my repo.
