# gate-the-probe-corpus — tasks

- [x] 1 Added to `scripts/gate.sh`'s fail-fast prefix, after biome, so
      `.husky/pre-commit` and `npm run gate` share one implementation.
- [x] 2 **Verified to discriminate — on the third attempt, and the two failures
      are the useful part.** (a) Appending a comment to a probed line did *not*
      fail: an anchor is a substring match, so a trailing edit leaves it
      applying, which is correct — the case still quotes the same code. (b)
      Rewriting the line to something type-invalid failed at `tsc`, before the
      probe check ran: the fail-fast prefix working as designed, but not a test
      of this check. (c) A type-valid, semantics-preserving refactor (adding
      braces) fails the gate naming the case, quoting the anchor and saying what
      to do.
- [x] 3 **Cost: 0.02–0.03 s user CPU**, measured over three runs — the cheapest
      check in the gate by roughly three orders of magnitude.
- [x] 4 `docs/test-strength.md` §2a, the `.husky/pre-commit` comment and
      `gate.sh`'s header updated. The runner now reports an anchor failure as a
      one-line gate failure rather than an unhandled stack trace, since a moved
      anchor is an expected outcome of ordinary refactoring, not a crash.
- [x] 5 Full gate green.
