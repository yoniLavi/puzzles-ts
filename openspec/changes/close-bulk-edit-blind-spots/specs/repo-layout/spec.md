# repo-layout Specification Delta — close-bulk-edit-blind-spots

> Both are ADDED rather than folded into the existing assertion-strength and
> path-move requirements, which are long and whose text is unchanged.

## ADDED Requirements

### Requirement: A bulk mechanical edit is checked for shape and for scope

A bulk mechanical edit SHALL be verified by two checks before it is committed.
Such an edit — a file move, an import repoint, a rename sweep — rewrites many
files at once, and the two checks answer different questions:

- **Shape.** Every changed line is the *kind* of line the edit was meant to
  change (an import line for an import repoint; a comment for a documentation
  sweep).
- **Scope.** Every changed *file* has some connection to what moved.

Neither subsumes the other. Shape cannot see a rewrite that produces a
well-formed line of the right kind in a file that had no business changing; scope
cannot see a rewrite confined to the files that did move.

`scripts/check-rename-shape.mjs` performs both. It SHALL NOT be a commit-gate
step: only the author knows a diff was *meant* to be a pure rename, so a commit
that deliberately changes behaviour alongside a move would fail it for being what
it says it is. Its report is a prompt to look, not a verdict.

The tool SHALL report **how many lines it inspected** alongside how many
offended. Both checks report offenders, so a diff parser that parsed nothing
returns a clean bill of health — the failure `module-layering.test.ts` had, where
a blinded resolver passed six of seven tests having inspected zero imports.

#### Scenario: A rewriter edits a line of the right kind in the wrong file

- **WHEN** a bulk import repoint is verified
- **THEN** the scope check reports every changed file that mentions none of the
  moved paths
- **BECAUSE** a resolve-and-re-derive rewriter also *normalises*: seven files'
  extensionless specifiers silently gained `.ts` in
  `group-crowded-source-directories`, and each was a perfectly well-formed import
  line that the shape check passed

#### Scenario: A rewriter edits prose that looks like code

- **WHEN** a bulk import repoint is verified
- **THEN** the shape check reports every changed line that is not an import line
- **BECAUSE** `src/test-setup/icons.ts`'s doc comment contains
  `import "../test-setup/icons.ts";` written from a *consumer's* perspective, and
  a rewriter cannot tell prose from code

### Requirement: An assertion distinguishes the value it names from a superstring

An assertion SHALL be able to fail on the defect it was written for. A
**positive** `toContain` (or equivalent substring check) whose needle is a single
character, or a short string in a small alphabet, does not meet this bar: it is
satisfied by every string that merely *contains* the needle, and the corruptions
that actually occur — a stray suffix, a doubled glyph, a wrong-width pad — are
exactly superstrings.

Where the subject is a whole rendering (a text format, an ASCII board), the
assertion SHALL be on the whole value. `toMatchInlineSnapshot()` fills itself in
on first run, so there is nothing to transcribe, and it SHALL be paired with at
least one targeted assertion so that a careless `vitest -u` cannot erase the
guarantee.

The negative form is **not** covered: `not.toContain("x")` is *strengthened* by
the superstring property, since it fails on the superstring too.

#### Scenario: A text-format test is written with single-character needles

- **WHEN** a test asserts a rendered text format
- **THEN** it asserts the whole rendering, not the presence of individual
  characters
- **BECAUSE** `abcd.test.ts` checked its board with `toContain("A")`,
  `toContain(".")`, `toContain("-")` and `toContain("|")`, and when a bulk
  rewriter turned the empty-cell character from `"."` into `"./"` — corrupting
  every cell of every board — all 28 tests in the file stayed green, because a
  string containing `"./"` contains `"."`
