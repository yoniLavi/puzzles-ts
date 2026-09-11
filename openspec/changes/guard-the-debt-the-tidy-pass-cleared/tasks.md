## 1. Citations in source

- [ ] 1.1 Measure `src/**/*.ts` the way the live requirement demands: how many
      kebab tokens a change-id scan finds, how many resolve, and what the
      unresolved ones are. Record the numbers in the change.
- [ ] 1.2 If the measurement supports widening, extend `SCANNED` to source, keep
      the ledger exactly the unresolved set, and floor the files and tokens
      scanned. Verify the gate fails on a deliberately dead citation in a `.ts`
      comment and passes on a clean tree.
- [ ] 1.3 Decide the 23 surviving `design D<n>` and `§<n>` tags: remove them,
      repoint them at a heading that exists, or ledger them. Verify no test
      title changes, so no snapshot key is orphaned.

## 2. knip

- [ ] 2.1 Add a knip invocation scoped to unused exports and types, with a floor
      that fails if it scans nothing. Verify it fails on a deliberately
      unimported export and passes on the current tree.
- [ ] 2.2 Time it, and place it in the gate's fast prefix only if it is cheap
      enough; otherwise put it beside the other heavy steps. Record the timing.

## 3. Complexity

- [ ] 3.1 Set `maxAllowedComplexity` from the measured distribution and exclude
      `*.test.ts`. Verify the whole tree is green at the chosen number.
- [ ] 3.2 For each site the rule then names, either simplify it or record why it
      stays, in a comment at the site that states the reason rather than the
      history.

## 4. Close

- [ ] 4.1 Run the full gate, and verify each of the three steps fails on a
      planted violation and passes on the clean tree.
- [ ] 4.2 Archive the change.
