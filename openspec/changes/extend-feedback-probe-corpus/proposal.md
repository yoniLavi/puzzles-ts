# extend-feedback-probe-corpus

## Why

`strengthen-engine-test-feedback` built `npm run probe` and took ten engine
modules to 100%. Ten is where the mutation audit happened to look, not where the
risk is: the modules it chose were the seven Stryker could afford plus the three
the audit had just written tests for.

Ranked by **blast radius** instead, the list is different. `params.ts` has **90
importers** and `colour-mkhighlight.ts` **37** — a defect in either reaches most
of the 57 games at once — and neither was probed. `findloop.ts` and
`grid-core.ts` are real algorithms (Tarjan bridge-finding; the planar incidence
builder) whose failures are silent by nature: a wrong answer is a `null` two
layers away in a game's indexing, never a throw.

## What Changes

- **21 more cases across four modules**, chosen by importer count and by whether
  a defect fails loudly or quietly.
- **Fix what they find**, in the module's own tests.
- **No production code**, unless a survivor turns out to be a real defect.

## Impact

- Affected specs: `repo-layout`. Two amendments the work produced rather than
  assumed — the "own tests" definition widens to include a **barrel** that
  re-exports the module (the third wrong answer to that one question), and a new
  scenario forbids the **self-referential assertion** that let a halved dot
  degree pass 151 tests.
- Affected code: `params.test.ts`, `findloop.test.ts`, `grid.test.ts`, plus the
  probe corpus and its runner. **No production code.**
