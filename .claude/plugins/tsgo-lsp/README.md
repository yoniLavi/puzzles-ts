# tsgo-lsp

Points Claude Code's LSP tool at this repository's own `tsgo --lsp`, instead of
`typescript-language-server` on `typescript` 5.9. Two things follow:

- The diagnostics the tool pushes after an edit come from the compiler the gate
  runs (`AGENTS.md` § "Git").
- A reference query does not come back short while the server loads.

It is **not enabled by default**. The LSP tool is configured per user
(`ENABLE_LSP_TOOL=1`), so swapping its server is each developer's choice.

To use it for a session, run `npm install`, then:

    claude --plugin-dir .claude/plugins/tsgo-lsp \
      --settings '{"enabledPlugins":{"typescript-lsp@claude-plugins-official":false}}'

The `--settings` part turns the default TypeScript plugin off for that session.
What Claude Code does with two servers registered for `.ts` is not documented,
and it was not tried.

Trialled 2026-09-12 (`weigh-a-semantic-code-server`'s `findings.md`):

- On five queries, it gave the same reference and implementation answers as the
  default server.
- It answered in full on the first, cold query.
- It worked in a fresh session loaded this way.

Installing it permanently, through a local marketplace, was not trialled. The
installed `tsgo` is a dev preview, so if an operation fails, drop the flags and
the default plugin is back.
