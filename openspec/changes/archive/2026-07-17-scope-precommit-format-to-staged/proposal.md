# Change: Scope the per-commit format check to staged files

## Why

`add-gate-format-check` made the biome step `biome ci .` (whole tree) everywhere
— the right call while the tree still had latent drift to flush. Now the tree is
uniformly formatted, so the per-commit hook re-checking all 507 files on every
commit is redundant work whose only unique value (catching drift the author did
not introduce) belongs to the backstop, not the hook. A commit can only make a
file unformatted by touching it.

## What Changes

- The gate's biome step is scoped by whether it runs as the automatic
  per-commit hook or as the whole-tree backstop:
  - **Pre-commit hook** → `biome check --staged --no-errors-on-unmatched` (the
    read-only `check`, restricted to staged files), so it inspects exactly the
    files the commit touches.
  - **CI and manual `npm run gate`** → keep whole-tree `biome ci .`.
- `scripts/gate.sh` gains a `GATE_BIOME_STAGED` toggle (default off →
  whole-tree); `.husky/pre-commit` sets it. The single-script principle holds —
  order, concurrency, and every check are still one file.

## Why keep CI / manual whole-tree (not scoped too)

- CI is the **only** gate a `--no-verify` commit passes through; if it too
  checked only "changed" files it would let an unformatted bypass land on
  `main`. (`biome ci` has no `--staged`, only `--changed`, which on trunk
  resolves against `main` — i.e. nothing after the commit is on `main`. So a
  scoped CI check is not even well-defined here.)
- A Biome upgrade can restyle the whole tree; the whole-tree backstop is what
  forces the reformat-on-bump in that same commit (as `6b4ff96` did). A scoped
  hook alone would let the rest of the tree rot silently.

## Impact

- Affected specs: `build-pipeline` (one MODIFIED requirement)
- Affected code: `scripts/gate.sh`, `.husky/pre-commit`, `AGENTS.md`
- No runtime/bundle impact — dev tooling only.
