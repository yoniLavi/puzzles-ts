# Weigh a semantic code server

## 1. The record to replay

- [ ] 1.1 Collect every documented name-keyed miss, each with the population it
      should have found, from:
      - `AGENTS.md` § "A scan that keys on a name finds only the games that were
        named that way"
      - `docs/test-strength.md` §7
      - the archive (`grep -ril "keys on a name\|key on the shape"
        openspec/changes/archive`)
      - the `tierNames` census in `correct-stale-requirement-text`

      Record the true population for each by reading, not by a tool. The replay
      is scored against that list.
- [ ] 1.2 Classify each miss: **symbol** (a reference graph answers it),
      **syntax** (a parser answers it: generics, call forms), or **text** (a
      copied value, a renamed copy, prose). The text rows are the ones no tool
      in this change is expected to catch; say so rather than scoring them as
      failures.

## 2. The baseline already installed

- [ ] 2.1 Replay every symbol and syntax row with Claude Code's LSP tool:
      `findReferences`, `workspaceSymbol`, `goToImplementation`. Record the
      found / true count per row. **Warm the server first and control every
      query with a known positive**: on 2026-09-12 a cold `findReferences` on
      `tierNames` returned 2 references with no error, and the same query warm
      returned 72 (`research.md`).
- [ ] 2.2 Explain why the `typescript-lsp` plugin reported
      `src/engine/difficulty.ts:217,220` errors that `tsgo` does not. On
      2026-09-12 the plugin ran TypeScript 5.9.3 (the global install and the
      workspace agree), against the gate's `tsgo` 7.0.0-dev, so the likely
      cause is 5.9 against 7 on a JSDoc `{@link}`. Confirm or refute it, and
      whether a language server can be pointed at `tsgo`'s own LSP instead.
      Record whether its reference answers can be trusted where its diagnostics
      cannot.
- [ ] 2.3 Replay the syntax rows with a compiler-API script shaped like
      `scripts/checks/unused-exports.mjs`, in the scratchpad.

## 3. The candidates

- [x] 3.0 Desk research on Serena, the LSP tool, `tsgo --lsp`, `ast-grep` and
      the other code-intelligence servers, with nothing installed: `research.md`.
      It recommends not trialling Serena now, so 3.2 and 3.4 wait on the owner.
      It adds two candidates the scaffold lacked: pointing the LSP tool at
      `tsgo --lsp --stdio`, and a committed compiler-API `npm run refs` script.
- [ ] 3.1 **Ask the owner before installing anything.** A trial install of
      Serena (`uv tool install`) or of `ast-grep` writes outside this
      repository.
- [ ] 3.2 Serena, at user scope with `--context claude-code`:
      - replay sections 2.1 and 2.3's rows through its symbol tools;
      - record which TypeScript language server it starts and whether its
        diagnostics agree with `tsgo` on this tree;
      - record what it writes under `.serena/` and anywhere else;
      - record whether it runs a dashboard or makes network calls;
      - record its resident memory while the suite runs;
      - record how much context its tool descriptions take.
- [ ] 3.3 `ast-grep` (tree-sitter based) on the syntax rows, for comparison:
      the owner's question named tree-sitter, and Serena is not built on it.
- [ ] 3.4 In a real task, not a replay, note whether the built-in-tool bias
      that Serena's docs warn about showed up, and what its system-prompt
      override costs (it replaces Claude Code's own system prompt).

## 4. Fit with how this repo works

- [ ] 4.1 Serena's memory system against `AGENTS.md` § "Work management" (a
      decision persists only by commit; an agent-private note is never cited):
      can it be disabled, and should it be?
- [ ] 4.2 Project scope versus user scope: what a committed MCP config would
      ask of every contributor, against the rule that `npm install` is the whole
      setup for building the app. A development tool is not the app build, so
      say which rule actually applies.

## 5. Conclude

- [ ] 5.1 Write `findings.md`: the replay table (row, class, true population,
      found by each instrument), the costs measured in section 3, and a
      recommendation.
- [ ] 5.2 Whatever the recommendation, write the instrument down. "Take a
      population by references or by syntax, never by a name", with the command
      to run, goes into `AGENTS.md` § "A scan that keys on a name" and
      `docs/test-strength.md`. Correct `AGENTS.md` § "Git"'s claim that `tsgo`
      backs the agent language server.
- [ ] 5.3 Present the recommendation to the owner; adoption is their decision.
      If it adds a requirement (say, to `repo-layout`), drop `skip_specs` and
      add the delta.
- [ ] 5.4 Full gate, archive.
