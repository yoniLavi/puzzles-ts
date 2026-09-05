# repo-layout — deltas for unify-the-note-taking-cell

## MODIFIED Requirements

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

**Renaming an identifier is the case where shape says almost nothing**, because
such an edit changes lines of every kind — declarations, reads, assertions, and
prose in comments. For that case the tool SHALL offer a stronger check instead:
map each new name back to the old one it replaced and require the result to be
the committed file, byte for byte. Anything else in the diff survives that fold
and is reported.

Two old names MAY fold to one new one, which is what merging two vocabularies
looks like. The tool SHALL then choose per file whichever old name that file
actually used, because folding both would rewrite the other camp's name into it,
and SHALL report rather than guess at a file that used both.

A rename lengthens identifiers, so the formatter rewraps lines that no longer
fit, and a rewrap is not invertible — an expanded object literal stays expanded
and gains a trailing comma. The tool SHALL report a residue explained only by
line breaks and those commas **separately** from a difference in content, so
that neither is silently folded into the other.

`scripts/check-rename-shape.mjs` performs all of these. It SHALL NOT be a
commit-gate step: only the author knows a diff was *meant* to be a pure rename,
so a commit that deliberately changes behavior alongside a move would fail it for
being what it says it is. Its report is a prompt to look, not a verdict.

The tool SHALL report **how many lines it inspected** alongside how many
offended, and how many files the fold check compared. Every check reports
offenders, so a diff parser that parsed nothing returns a clean bill of health —
the failure `module-layering.test.ts` had, where a blinded resolver passed six of
seven tests having inspected zero imports. Say what was looked at.

#### Scenario: A rewriter edits a line of the right kind in the wrong file

- **WHEN** a bulk import repoint is verified
- **THEN** the scope check reports every changed file that mentions none of the
  moved paths
- **BECAUSE** a resolve-and-re-derive rewriter also *normalizes*: seven files'
  extensionless specifiers silently gained `.ts` in
  `group-crowded-source-directories`, and each was a perfectly well-formed import
  line that the shape check passed

#### Scenario: A rewriter edits prose that looks like code

- **WHEN** a bulk import repoint is verified
- **THEN** the shape check reports every changed line that is not an import line
- **BECAUSE** `src/test-setup/icons.ts`'s doc comment contains
  `import "../test-setup/icons.ts";` written from a *consumer's* perspective, and
  a rewriter cannot tell prose from code

#### Scenario: An edit rides along with a rename sweep

- **WHEN** a vocabulary rename is verified with the fold check
- **AND** one changed file also carries an unrelated edit
- **THEN** that file is named as not explained by the rename
- **BECAUSE** every other changed file folds back to its committed version byte
  for byte, so the one that does not is the whole finding
