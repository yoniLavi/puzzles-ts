# Desk research, before any trial

Read 2026-09-12 from Serena's repository, docs and issue tracker, Claude Code's
docs and issue tracker, the TypeScript 7 announcements, ast-grep's docs, and this
machine's installed tools. **Nothing was installed and no server was trialled.**
Every claim below is dated by this line; tools move, so re-check before relying on
one.

## The recommendation this research supports

**Do not trial Serena now.** For this repo's actual failure it would put a second
copy of the reference graph the session already has behind a Python toolchain, a
telemetry ping, a browser dashboard, an agent-private memory store and a
replacement system prompt. Take the cheaper steps in "What to do instead" first,
and re-open the question if one of the conditions in "What would change this"
comes true.

The adoption decision remains the owner's (proposal, "Deliverable").

## What Serena is, for TypeScript

- **The same server this session already runs.** Its default TypeScript backend
  is `typescript-language-server` 5.1.3 over `typescript` 5.9.3, launched
  `--stdio` (`src/solidlsp/language_servers/typescript_language_server.py`). An
  alternative backend is `@vtsls/language-server`. Both need Node. It uses no
  tree-sitter anywhere: `pyproject.toml` has no such dependency and a code search
  for `tree_sitter` is empty.
- **No `tsgo`.** Issue #1402 asked for it and a maintainer called it "not a
  problem", but PR #1406 was closed unmerged on 2026-07-13 after its install
  failed in CI. `ls_specific_settings.typescript.ls_path` swaps the binary, and
  the one user who pointed it at `tsgo --lsp` also had to patch Serena's source.
- **The same silent-partial-results bug.** #1937 (open): `find_referencing_symbols`
  returns a partial answer with no error while tsserver is still loading.
  Claude Code's LSP bridge has the matching report (#44767).
- **Other open TypeScript defects**:
  - #1956 (fix in PR #1972): `replace_symbol_body` on `export const x = …`
    reports OK and writes `export const export const …`. This tree is dense with
    exported consts.
  - #1939: cross-package references are under-counted without tsconfig project
    references.
  - #1235: every client that opens the project starts its own tsserver.
- **What it writes and sends:**
  - `~/.serena/` holds config, dated logs and global memories. Language servers
    are auto-downloaded on first use, possibly under `~/.solidlsp/`.
  - `<project>/.serena/` holds `project.yml`, `memories/` and caches.
  - A Flask dashboard runs on 127.0.0.1:24282 and **opens a browser by default**
    (`web_dashboard_open_on_launch`).
  - **A usage ping is sent on every start**, to
    `https://oraios-software.de/serena_usage.php` (`agent.py`). Opt out with
    `SERENA_USAGE_REPORTING=false`.
- **Memories and onboarding:** onboarding runs automatically when a project has
  no memories. Mode `no-memories` removes the memory tools and onboarding. An
  earlier bug (#954, closed, fix unconfirmed) still sent the memory instructions
  under that mode. Unless disabled, it is the agent-private second record that
  `AGENTS.md` § "Work management" rules out.
- **Claude Code integration:**
  - The `claude-code` context drops Serena's file, shell and text-search tools.
  - Its prompt marks Read "FORBIDDEN for discovery" and Edit "FORBIDDEN".
  - Its docs say recent Claude Code and Opus releases "drastically reduced
    adherence" and that Claude Code's own tool descriptions take "almost 16k
    tokens".
  - The fix they recommend has two parts. First, `claude --system-prompt="$(serena
    prompts print-cc-system-prompt-override)"`, which **replaces** Claude Code's
    system prompt rather than appending to it. Second, `serena-hooks` entries in
    `.claude/settings.json`.
  - #802 reports the tools falling out of use after compaction.
- **Evidence it helps:**
  - Oraios's own evaluation asked the agents to judge the tools. It covered
    Python, Java and a mixed repo, **ran on the JetBrains backend, and had no
    TypeScript, no control and no task-success rate**. It concludes the tools
    help multi-file refactors, while the built-ins are better for small edits and
    text search.
  - The one independent study found, arXiv 2608.13568 ("Does a Language Server
    Save Tokens for Coding Agents?"), is a single-author preprint and was not
    verified here. It calls the benefit "conditional and usually negative":
    agents picked semantic tools 0–6% of the time, and grep beat location-only
    LSP on renames.
- **Install and cadence:**
  - `uv tool install -p 3.13 serena-agent`, Python ≥3.11 and <3.15.
  - Release 1.7.0 came out 2026-08-09, with a release every 2–4 weeks.
  - Config keys still change between minors: 1.7.0 renamed `languages` to
    `language_servers`.

## What this session already has

- **Claude Code's LSP tool**, enabled at user scope (`ENABLE_LSP_TOOL=1`, plugin
  `typescript-lsp` 1.0.0, command `typescript-language-server --stdio`, no
  `initializationOptions`).
  - Operations: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`,
    `workspaceSymbol`, `goToImplementation`, and the call-hierarchy trio.
  - **Diagnostics are pushed into context after every edit**, which is why the
    5.9-versus-`tsgo` disagreement on `difficulty.ts` is a live false signal
    rather than a curiosity. A plugin's `diagnostics: false` turns that push off.
- **A cold-start trap, measured this session.** The first `findReferences` on
  `tierNames` (`src/engine/difficulty.ts:220`) ran while the server was starting.
  It returned **2 references in 1 file**, with no error or warning. The identical
  query a minute later returned **72 across 32 files**, all 29 tiered games. A
  `findReferences` on `latinSolver` issued alongside it failed outright ("server
  is starting"). Warm, it returned all six game solvers, including the five call
  sites written `latinSolver<null>(`, which a grep for `latinSolver(` misses. **So
  the LSP tool takes a population correctly only once it is warm, and a cold
  answer looks exactly like a warm one.** This is `docs/test-strength.md` §7's
  "capped or blind" row, aimed at a language server.
- **`tsgo` 7.0.0-dev.20260707.2 has `--lsp`** (`-stdio`, `-pipe`, `-socket`) and an
  unstable `--api`.
  - TypeScript 7.0 RC shipped 2026-06-18. Microsoft calls its editor support
    "rock-solid", while the typescript-go README said "nearly all features
    implemented".
  - The programmatic API is "not ready", expected with 7.1.
  - The typescript-go repository was archived 2026-09-01, and development moved
    back to microsoft/TypeScript.
  - Whether Claude Code's LSP bridge works against `tsgo --lsp --stdio` is
    untested. A plugin manifest accepts any command.
- **`typescript` 5.9's compiler API**, already driven by
  `scripts/checks/unused-exports.mjs` and `vacuous-assertions.mjs`. Its
  `LanguageService.findReferences` is the same query tsserver answers, run
  synchronously after the program is built, so it has no warm-up race.

## The record, classified by what could have caught it

A first pass from `AGENTS.md`'s own examples. Task 1.1 still owes the true
populations, taken by reading.

| miss | class | caught by |
| --- | --- | --- |
| `tierNames(<digit>` missing `tierNames(DIFF_COUNT)` | symbol | references (warm) |
| `latinSolver(` missing `latinSolver<Ctx>(` | syntax | references (warm), a structural pattern |
| `findMistakes` missing `findBoatsMistakes`; `hint` missing `netslideHint` | symbol, if the function is what a registered `Game` member points at | references on the `Game` member — likely, unverified |
| `solve*` missing `findUndeadSolution`, `fullSolve` | role, not name | nothing mechanical short of a shared type; read the population |
| `DIFF_NAMES` missing tier words typed into preset titles | text | search for the *values*; no symbol tool |
| `parseLeadingInt` scenario missing `eatNum`, `readInt` and inline loops | text / shape | a structural pattern at best; reading |
| "modules with no test" matched on filename | import graph | references / an import scan |

About half the record is reachable by references. That half needs no new server.
The rest is reachable by nothing a language server offers.

## What to do instead, cheapest first

1. **Write the instrument down.** Take a population by references or by syntax,
   never by a name. Hand the query a known positive first, because a cold
   language server answers short without saying so. Where the miss is a typed-out
   value or a renamed copy, search for what it *said*, and read the population
   when it is small. This goes in `AGENTS.md` § "A scan that keys on a name" and
   as a §7 row in `docs/test-strength.md` (the cold 2-of-72). Correct `AGENTS.md`
   § "Git"'s claim that `tsgo` backs the agent's language server.
2. **A committed `npm run refs` script** on the 5.9 compiler API, shaped like
   `unused-exports.mjs`. Given a `file:symbol`, it prints references per file and
   the total. It is deterministic, has no warm-up race, is usable from a guard,
   adds no dependency, and needs no MCP. It inherits TypeScript 5.9's reading of
   the tree rather than `tsgo`'s, so the known disagreement on `difficulty.ts`
   needs checking against it.
3. **Point the LSP tool at `tsgo --lsp --stdio`** with a user-level or local
   plugin. Then the diagnostics pushed after every edit come from the compiler the
   gate trusts, and the `AGENTS.md` § "Git" sentence becomes true. It is a small
   trial, but it touches user-scope Claude Code config, so it needs the owner.
   Check `findReferences` against the warm 5.9 answer before trusting it.
4. **`ast-grep` as a devDependency**, for the syntax and shape rows.
   `@ast-grep/cli` ships prebuilt binaries through npm, so it installs into
   `node_modules` rather than outside the repo. That corrects the proposal's
   "Impact", which assumed a global prefix. Whether `latinSolver<$T>($$$A)`
   matches is unverified. It is still a new dependency, so it needs the owner.

## The case against each step

Weighed 2026-09-12, after the owner accepted not trialling Serena.

1. **Writing the instrument down.**
   - `AGENTS.md` is 718 lines and loads into every session, so another paragraph
     is a standing tax. Fold the rule into § "A scan that keys on a name" rather
     than adding a section.
   - The rule must not name the LSP tool as *the* command. The tool is enabled
     only in the owner's `~/.claude/settings.json`, and a subagent in this same
     session had no LSP tool at all. That is an argument for landing step 2
     first and naming its command.
2. **`npm run refs`.**
   - It is one more consumer of TypeScript 5.9's compiler API, which TypeScript 7
     does not offer until 7.1. The marginal risk is small, because
     `unused-exports.mjs`, `vacuous-assertions.mjs` and `enrollment.ts` already
     depend on it and would migrate together.
   - It is blind to a population taken from source text. `enrollment.ts` reads
     game source through three `?raw` globs, and a text read is no reference.
     The script's output must say it answers "who references this symbol",
     never "who uses this mechanic".
   - It rebuilds a whole program per run, which is seconds at `tsc`'s speed
     (the gate's figure is ~13 s for a check). That is fine ad hoc, and too slow
     to call in a loop.
3. **The LSP tool on `tsgo --lsp`.**
   - It is user-scope config; a replacement for the `typescript-lsp` plugin
     would apply to every project on the machine, including ones without
     `tsgo`. A local plugin enabled per project avoids that, at the cost of a
     committed `.claude/` entry.
   - The installed build is a July dev preview. If its references or
     implementations are incomplete, replacing the 5.9 server loses them, so
     check its answers against the warm 5.9 ones first.
   - Its memory footprint on this swapping machine is unmeasured.
   - The binary must resolve to this repo's `node_modules/.bin/tsgo`, or the
     diagnostics stop agreeing with the gate, which was the point.
4. **`ast-grep` as a devDependency.**
   - The syntax row it would serve is already answered by step 2 and by a
     regex allowing type arguments.
   - Its unique reach is renamed copies by shape, and the record's copies vary
     (`eatNum`, `readInt`, some forty inline loops), so a pattern catches only
     the copies someone thought to describe. The TypeScript AST that
     `vacuous-assertions.mjs` already walks can express the same shapes without
     a dependency.
   - This repo has already carried a tool installed for a job and wired to
     nothing: `knip`, until `5f5b0d10`.
   - **Defer it until task 1's replay shows a row only it catches.**

## What would change this

- Serena ships a supported `tsgo` backend and fixes #1937. The reference graph
  would then differ from what the LSP tool gives.
- The repo's work turns toward large multi-file symbol refactors that the
  typecheck-then-fix loop handles badly. That is the one use Oraios's own
  evaluation supports.
- A controlled measurement, rather than self-report, shows agents on
  TypeScript doing better with it.
