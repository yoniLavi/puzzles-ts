# Design: dev guides — placement, form, anti-drift

## Decisions (owner-confirmed 2026-06-16)

- **Placement: a new `docs/` tree.** `docs/porting/{game-port-playbook,hint-authoring}.md`.
  Rejected alternatives: folding into the openspec specs (requirement/scenario
  shape is hostile to a procedural checklist), expanding `AGENTS.md` in place
  (already 304 lines; mixes strategy with procedure), one root
  `CONTRIBUTING-games.md` (bundles two distinct workflows that will diverge).
- **Process: one openspec change, battle-tested on port #15.** Per the
  project's "one change per coherent unit" rule. Land provisional v1, validate
  it against a real port before declaring it codified, archive after.

## The anti-drift rule (the load-bearing constraint)

The guides describe *how*; the specs describe *what*. A guide MUST link to the
authoritative requirement rather than restate it, and MUST name exemplar files
rather than copy code. Concretely:

- A normative claim ("a game is registered only at owner-accepted parity") gets
  a one-line statement **plus a link** to the `ts-migration` requirement that
  owns it — not a paraphrase that can fall out of sync.
- A pattern ("packed bits in an `Int32Array` cache key") points at the file
  that exemplifies it (`galaxies/render.ts`) rather than pasting a snippet that
  rots.

This is why two guides + a small `repo-layout` requirement is the whole change:
the guides carry no independent normative weight, so they cannot contradict the
specs — they can only get stale links, which `openspec` validation and ordinary
review catch.

## Why guides at all, given the specs exist

The specs are organized by *capability* and shaped as requirements; they answer
"is X allowed / required?" They do not answer "what do I do first, then next?"
That procedural ordering is currently implicit in the archived changes. The
guides make it explicit and followable — the gap a new porter actually hits.

## Scope boundary

`AGENTS.md` sections are not rewritten — only pointed at the guides. A larger
`AGENTS.md` reorganization (moving procedure out, leaving strategy) is a
plausible follow-up but is deliberately out of scope here to keep this change
small and reversible.
