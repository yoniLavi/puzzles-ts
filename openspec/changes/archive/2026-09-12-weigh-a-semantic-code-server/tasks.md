# Weigh a semantic code server

## 1. The record to replay

- [x] 1.1 Collect every documented name-keyed miss, each with the population it
      should have found. Sources: `AGENTS.md` § "A scan that keys on a name
      finds only the games that were named that way", `docs/test-strength.md`
      §7, the archive, and the `tierNames` census in
      `correct-stale-requirement-text`. Record the true population for each by
      reading, not by a tool. `research.md` § "The record, classified"; the true
      populations are in `findings.md`'s replay table, except `findMistakes`,
      which is marked not read.
- [x] 1.2 Classify each miss as **symbol**, **syntax** or **text**
      (`research.md`).

## 2. The baseline already installed

- [x] 2.1 Replay the symbol and syntax rows with the LSP tool, warming it
      first and controlling with a known positive. See `findings.md`. The cold
      trap reproduced, and in one run a wait-until-stable loop was fooled by 2,
      2, 2.
- [x] 2.2 The `difficulty.ts` errors the plugin reported. **Not reproduced**:
      in a 6 s window neither server reported anything for the file, so the
      5.9-against-7 cause stays unconfirmed. A language server *can* be pointed
      at `tsgo`'s own LSP: `.claude/plugins/tsgo-lsp`, trialled end to end. The
      reference answers agreed across all servers on every query.
- [x] 2.3 A compiler-API script for the rows: committed as `npm run refs`
      (`scripts/refs.mjs`) rather than left in the scratchpad, because the
      written rule needs a command every agent has.

## 3. The candidates

- [x] 3.0 Desk research on Serena, the LSP tool, `tsgo --lsp`, `ast-grep` and
      the other code-intelligence servers, with nothing installed:
      `research.md`.
- [x] 3.1 Ask the owner before installing anything. They declined a Serena
      trial and approved the `tsgo` plugin trial (2026-09-12).
- [x] 3.2 Serena at user scope: **not done**, by the owner's decision.
      `research.md` answers its questions from the source and docs.
- [x] 3.3 `ast-grep`: **deferred**. No symbol or syntax row needed it
      (`research.md` § "The case against each step").
- [x] 3.4 Serena's built-in-tool bias in a real task: **not done**, by the same
      decision.

## 4. Fit with how this repo works

- [x] 4.1 Serena's memory system: moot without adoption. `research.md` records
      that the `no-memories` mode removes it.
- [x] 4.2 Project scope against user scope, answered for what was adopted. The
      `tsgo` plugin is committed but not enabled, because the LSP tool is
      per-user configuration. `npm run refs` needs nothing beyond
      `npm install`.

## 5. Conclude

- [x] 5.1 `findings.md`: the replay table, the measured costs and the outcome.
- [x] 5.2 The instrument, written down in `AGENTS.md` § "A scan that keys on a
      name", `docs/games/testing.md` and `docs/test-strength.md` §7.
      `AGENTS.md` § "Git"'s `tsgo` claim is corrected, and so is its stale
      hintless count.
- [x] 5.3 The owner accepted the recommendation. No requirement was added, so
      `skip_specs` stands.
- [x] 5.4 Full gate, archive.
