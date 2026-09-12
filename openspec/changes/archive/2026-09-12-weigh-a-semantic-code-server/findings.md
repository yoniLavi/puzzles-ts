# Findings

Measured 2026-09-12, on the developer machine at load average ~8 with **21.7 of
22.5 GB of swap in use**. Every memory and timing figure below was taken under
paging, so it is an upper bound and not comparable across runs. The counts do
not depend on load.

## Outcome

- **Serena: not trialled.** The owner accepted `research.md`'s recommendation.
  That file holds the desk answers to the Serena questions this change posed.
- **The written rule** now lives in three places:
  - `AGENTS.md` § "A scan that keys on a name"
  - `docs/games/testing.md` § "How a cross-game guard finds its population"
  - a row in `docs/test-strength.md` §7
- **`npm run refs`** (`scripts/refs.mjs`) answers who references a symbol, by
  reference.
- **`.claude/plugins/tsgo-lsp`** points the agent's LSP tool at the repository's
  own `tsgo --lsp`. It was trialled end to end. It is not enabled by default: the
  LSP tool is per-user configuration, so its README says how to load it.
- **`ast-grep`: deferred.** Every symbol and syntax row below was answered
  without it. The text rows are ones it could reach only by a pattern someone
  already thought to write.

## The replay: one question, four instruments

"tsls" is the default `typescript-language-server` 5.1.3 on `typescript` 5.9.3.
Cells give references / files / distinct games.

| question | tsls, cold | tsls, warm | `tsgo --lsp`, first answer | `npm run refs` | true population |
| --- | --- | --- | --- | --- | --- |
| `tierNames` references | **2 / 1 / 0** | 72 / 32 / 29 | 72 / 32 / 29 | 72 / 32 / 29 | 29 tiered games (the `correct-stale-requirement-text` census, re-read) |
| `latinSolver` references | "server is starting" | 31 / 9 / 6 | 31 / 9 / 6 | 31 / 9 / 6 | 6 solvers (`AGENTS.md`), five written `latinSolver<Ctx>(` |
| `Game.hint` references | — | 301 / 81 / 36 | 301 / 81 / 36 | 302 / 82 / 36 | not a population: see below |
| `Game.hint` implementations | — | 43 / 38 / 32 | 43 / 38 / 32 | not offered | 32 |
| `Game.findMistakes` references | — | 151 / 88 / 44 | 151 / 88 / 44 | 151 / 88 / 44 | not read |

- **The hint population is the implementations, not the references.** The
  references reach 36 games. That includes Blackbox, Cube, Slide and Twiddle,
  whose tests name `hint` for games that have none. The implementations reach
  32. That matches the audit's 27 hintless less Tracks and Bridges, which both
  gained a `hint.ts` on 2026-09-10 (`6db6cde4` for Tracks), for 57 in all. It
  also shows `AGENTS.md`'s "27 of the 57 games are hintless" had gone stale; it
  now reads as a query with a dated figure.
- **`refs` finds one more `Game.hint` reference than the language servers.** It
  loads the build-side project as well, and the extra file is under it.
- The `findMistakes` population was not checked by reading, so its 44 is an
  instrument's answer, not a verified one.

## What else was measured

- **The cold trap, reproduced over the protocol.** In one run tsls answered 2,
  then 2, then 72 at 3.5 s. In a second it answered **2, 2, 2 across 3.6 s**,
  and the probe's wait-until-stable loop accepted that. Waiting for an answer to
  settle does not tell cold from done; only a known positive does. `tsgo --lsp`
  answered in full on its first query in both runs, at 0.3 s and 0.6 s.
- **The plugin.**
  - The first form, `npx --no tsgo --lsp --stdio`, never showed a process, and
    left the tool "starting" for over 90 s. The cause was not determined.
  - A logging wrapper showed that Claude Code starts the server in the project
    root and expands `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` in
    `args`.
  - The committed form runs `env ${CLAUDE_PROJECT_DIR}/node_modules/.bin/tsgo`.
    It was confirmed in a fresh headless session (`--plugin-dir`, with the
    default plugin turned off through `--settings`): 31 references on the first,
    cold query.
- **Headless trials need a closed stdin.** The first one hung for over five
  minutes until given `< /dev/null`. Each trial cost ~$0.50 of API usage.
- **Diagnostics: the proposal's `difficulty.ts` errors were not reproduced.**
  In a 6 s window neither server reported anything for the file: tsls pushed an
  empty list and `tsgo` returned one when asked. Task 2.2's suspected cause (5.9
  against 7 on a JSDoc `{@link}`) therefore stays unconfirmed. What is settled
  is that, with the plugin loaded, the diagnostics come from the gate's
  compiler.
- **Memory and time**, all under paging:
  - `tsgo --lsp`: 70 MB after one query, 750 MB after five.
  - The tsls process tree: 165 MB before it loaded the project, 435 MB after.
  - `npm run refs`: 670–800 MB peak and 2.4–4.2 s per run.
  - A language server, once warm, is the cheaper way to ask many questions, and
    `refs` the dependable way to ask one.
