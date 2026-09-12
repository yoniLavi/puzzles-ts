# Weigh a semantic code server

**Readiness: done 2026-09-12.** The owner accepted `research.md`'s
recommendation not to trial Serena, and three of its four cheaper steps landed.
`findings.md` has the replay and the outcome; `ast-grep` is deferred. Several "not found" items below are answered there, and it
supersedes them.

Owner question, 2026-09-12:

> "we've been caught by this sort of thing several time and I'm wondering if the
> codebase is now complex enough for us to benefit from a treesitter mcp server
> like https://github.com/oraios/serena — could you please scaffold a change for
> us to research the pros and cons of that?"

## Why

**The repo's most repeated instrument failure is a scan that keys on a name.**
`AGENTS.md` § "A scan that keys on a name finds only the games that were named
that way" records the pattern: a sweep for `hint` that never sees
`netslideHint`, for `findMistakes` that never sees `findBoatsMistakes`, a grep
for `latinSolver(` that finds one of six call sites written `latinSolver<Ctx>(`,
a grep for `DIFF_NAMES` blind to preset titles that typed the tier words out, a
spec scenario about `parseLeadingInt` that held over copies named `eatNum` and
`readInt`.

It happened again on the day this was scaffolded. The census behind
`correct-stale-requirement-text` found tiered games by matching `tierNames(<digit>`
and reported 21. It missed Magnets, whose call is `tierNames(DIFF_COUNT)`, and
Bridges, whose list is named `DIFFICULTY_NAMES`. A find-references on
`tierNames` returns calls in 29 game files, both misses included.

So the question is real. But it is narrower than "should we adopt Serena", and
this change exists to answer it with measurements rather than a reply.

## What is known going in

Checked 2026-09-12. Re-check anything here before relying on it, since tools
move.

**Serena is built on language servers, not tree-sitter.** Its README names
LSP servers as the default backend, plus a paid JetBrains plugin as an
alternative. It does not mention tree-sitter.
- **Install:** `uv tool install -p 3.13 serena-agent`. uv, managing Python 3.13,
  is stated as the only prerequisite.
- **License and activity:** MIT, and actively developed.
- **Tools:** symbol lookup (`find_symbol`, `find_referencing_symbols`,
  `symbol_overview`, `type_hierarchy`, `find_implementations`, `diagnostics`),
  symbol-level edits (`replace_symbol_body`, `insert_after_symbol`, `rename`,
  `safe_delete`), text search, shell execution, and a memory system.
- **Language-server limits:** move and inline are JetBrains-only; rename works on
  symbols, not files.
- **Claude Code integration:** `claude mcp add serena -- serena start-mcp-server
  --context claude-code --project "$(pwd)"`. Its docs warn that Claude Code's
  built-in tools carry "almost 16k tokens" of descriptions and "a very strong
  bias towards internal tools". They suggest launching Claude Code with a
  replacement system prompt to counter that.
- **Also advised:** do not install it from an MCP or plugin marketplace.
- **Not found in the docs read:** which TypeScript language server it runs, what
  it writes under `.serena/`, and whether it runs a dashboard, logs or phones
  home.

**This session already has symbol lookup.** Claude Code's LSP tool is enabled at
user scope (`ENABLE_LSP_TOOL`, plugin `typescript-lsp`), not by anything in this
repo. The plugin runs `typescript-language-server --stdio` (5.1.3, installed
globally), on TypeScript 5.9.3 — the same version as this repo's `typescript`
package, and not the `tsgo` (7.0.0-dev) the gate checks with.
Find-references on `tierNames` (`src/engine/difficulty.ts:220`) returned 72
references across 32 files, every tiered game among them.

**That server is not the gate's typechecker, and it disagreed with it.** In the
same session it reported two errors in `difficulty.ts`, reading a
`{@link DifficultyContract.nonUniqueTiers}` in a doc comment as a value use.
`npm run typecheck` (`tsgo`) was clean.

`AGENTS.md` § "Git" says `tsgo` is "the same binary [that] backs the
editor/agent language server". That holds for an editor configured that way. It
does not hold for this agent's LSP tool. So a symbol tool is an instrument like
any other: its answers count only once checked against the compiler the gate
trusts (`AGENTS.md` § "Method: make the check check the thing").

**Not every name-keyed miss is a symbol problem.** A constant's value typed out
in a preset title, a copy of a helper under another name, and tier words in
spec prose are text. A language server's reference graph cannot see them.
`latinSolver<Ctx>(` is syntax: any parser handles it and a plain grep does not.

The repo already has two structural instruments built on the TypeScript
compiler API: `scripts/checks/unused-exports.mjs` and
`scripts/checks/vacuous-assertions.mjs`. Structural search (`ast-grep`, which is
tree-sitter based) is the third candidate beside a language server.

## Questions this change answers

1. **Replay the record.** For each name-keyed miss documented in `AGENTS.md`,
   `docs/test-strength.md` §7 and the archive, plus the `tierNames` census, try:
   - the built-in LSP tool
   - Serena's symbol tools
   - an `ast-grep` pattern
   - a compiler-API script

   Would it have taken the whole population? Which misses no symbol or syntax
   tool could catch?
2. **What Serena adds over what is already enabled.** Symbol overviews,
   symbol-level edits and onboarding against the LSP tool, `ast-grep` and a
   script. Measure, don't infer from feature lists.
3. **What it costs:**
   - a Python and uv toolchain on the development machine;
   - context spent on tool descriptions, and the built-in-tool bias with its
     system-prompt workaround;
   - memory on a machine that already swaps under the test suite;
   - whether its TypeScript server agrees with `tsgo` on this tree;
   - what it writes into the working tree.
4. **Whether it fits how this repo records things.** Serena's memories are an
   agent-private second record. `AGENTS.md` § "Work management" holds that a
   decision is persisted by committing it and that an agent-private note is
   never cited. If adopted, is the memory system switched off, and is `.serena/`
   committed or ignored?
5. **Whether the answer is a tool at all.** It may be a written instrument
   instead: "take a population by references or by syntax, never by a name",
   with the command to run, in `AGENTS.md` § "A scan that keys on a name" and
   `docs/test-strength.md`.

## Deliverable

`findings.md` in this change, with the replay table and a recommendation, one
of:
- adopt Serena at user scope;
- adopt it at project scope, with committed MCP config;
- or do not adopt it, and write the instrument down using what is already
  installed.

Whichever it is, a rule it establishes lands in `AGENTS.md` and the relevant
guide in the same change. The stale `tsgo` sentence in `AGENTS.md` § "Git" is
corrected either way.

**The adoption decision is the owner's**: they asked about this tool by name.

## Impact

- A research change. It adds no dependency, no MCP config and no gate step
  unless the owner accepts a recommendation to.
- A trial install of Serena writes outside this repository (uv's tool
  directory, `~/.serena/`). `ast-grep` need not: `@ast-grep/cli` installs as a
  devDependency into `node_modules`, but it is still a new dependency. Pointing
  the LSP tool at `tsgo` changes user-scope Claude Code config. Each needs the
  owner's say-so first.
