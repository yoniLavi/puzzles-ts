# Write the spec purposes

**Readiness: scaffolded 2026-09-12, not started.** Found while trying to upgrade
openspec from the pinned 1.10.0 to 1.13.0 at the end of
`spell-the-tile-size-once`; the upgrade was reverted and deferred to this change
(owner, 2026-09-12: stay on 1.10 and scaffold it).

## Why

**66 of the 71 specs under `openspec/specs/` have no Purpose.** Each still carries
the sentence `openspec archive` writes when a change creates a capability —
`TBD - created by archiving change <id>. Update Purpose after archive.` — and
nobody ever replaced it. The five that were written are `group`, `ts-engine`,
`build-pipeline`, `project-identity` and `ts-migration`. (Measured 2026-09-12 with
`grep -l "TBD - created by archiving" openspec/specs/*/spec.md`; re-run the query,
don't trust the count.)

**openspec 1.11.0 made that a strict-mode warning**, and the gate runs
`openspec validate --all --strict`, so on 1.13.0 the gate fails 66 items and
blocks every commit. Measured on the same day under 1.13.0: the placeholder
warning is the *only* finding at warning or error level anywhere in the tree —
every open change and the five written specs pass.

So the upgrade is blocked on documentation this repo owes anyway. A spec's
Purpose is the one sentence a reader gets before sixty requirements; a `TBD`
there is a hole the tool has now started pointing at.

## What Changes

- Write a real `## Purpose` for each placeholder spec, edited in
  `openspec/specs/<capability>/spec.md` directly — a `## Purpose` in a delta is
  read only when a capability is created, so no delta can replace one.
- Upgrade `@fission-ai/openspec` to the current release (1.13.0 when this was
  written), run `openspec update`, and confirm `openspec validate --all --strict`
  is clean.

No requirement changes, hence `skip_specs: true`.

## Impact

- `openspec/specs/*/spec.md` — the Purpose section of each placeholder spec.
- `package.json`, `package-lock.json` — the openspec pin. The gate's floor
  (`scripts/checks/openspec-version.mjs`) reads it from there, so it moves with
  it.
- `.claude/skills/openspec-*` and `.claude/commands/opsx/` are gitignored and
  regenerate locally with `openspec update`; nothing there is committed.
