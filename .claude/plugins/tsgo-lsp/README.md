# tsgo-lsp

Points Claude Code's LSP tool at this repository's own `tsgo --lsp`, instead of
`typescript-language-server` on `typescript` 5.9. The diagnostics the tool
pushes after an edit then come from the compiler the gate runs (`AGENTS.md`
§ "Git"), and a reference query does not come back short while the server
loads.

It is **not enabled by default**, because the LSP tool is configured per user
(`ENABLE_LSP_TOOL=1`) and swapping its server is each developer's choice.
`.claude/plugins/.claude-plugin/marketplace.json` makes it installable.

**For every session in this checkout**, after `npm install`:

    claude plugin marketplace add ./.claude/plugins --scope local
    claude plugin install tsgo-lsp@puzzles-ts --scope local
    claude plugin disable typescript-lsp@claude-plugins-official --scope local

`--scope local` writes to `.claude/settings.local.json`, which is not
committed. Disabling the default plugin matters: what Claude Code does with two
servers registered for `.ts` is not documented, and it was not tried.

**For one session only**:

    claude --plugin-dir .claude/plugins/tsgo-lsp \
      --settings '{"enabledPlugins":{"typescript-lsp@claude-plugins-official":false}}'

To go back, run `claude plugin enable typescript-lsp@claude-plugins-official
--scope local` and `claude plugin disable tsgo-lsp@puzzles-ts --scope local`.

The installed `tsgo` is a dev preview. If an operation fails, go back to the
default plugin. `weigh-a-semantic-code-server`'s `findings.md` has the trial
this rests on.
