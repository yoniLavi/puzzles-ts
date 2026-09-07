/**
 * `attachInternals()` for happy-dom, so Web Awesome's form controls can be
 * **mounted** in a tier-3 test rather than only invoked.
 *
 * Every form-associated Web Awesome component (`wa-button`, `wa-switch`,
 * `wa-checkbox`, …) calls `this.attachInternals()` in its constructor and then
 * reads `this.internals.validity` on its first update. happy-dom implements
 * neither `ElementInternals` nor the method that returns one, so the property
 * is `undefined` and the read throws — asynchronously, inside Lit's update
 * queue, as an unhandled rejection per component. The test itself passes and
 * `vitest` exits 1, which is the worst available shape of failure: a red run
 * whose message names a Web Awesome chunk and not the test.
 *
 * This installs the smallest stub the components actually read. It is
 * deliberately **not** a validation implementation: nothing here is asserted
 * against, and a stub that pretended to validate would invite a test to trust
 * it. `valid: true` is what an unset control reports in a browser, so a
 * component's own "am I invalid" branch takes the same path it would there.
 *
 * Import it *before* the component modules, the same ordering rule
 * `indexeddb.ts` documents — a constructor runs at custom-element definition
 * time, which is import time.
 *
 * Dev/test-only, like everything under this directory.
 */

interface StubInternals {
  form: null;
  labels: readonly Element[];
  validity: { valid: boolean };
  willValidate: boolean;
  validationMessage: string;
  states: Set<string>;
  checkValidity(): boolean;
  reportValidity(): boolean;
  setValidity(): void;
  setFormValue(): void;
}

function stubInternals(): StubInternals {
  return {
    form: null,
    labels: [],
    validity: { valid: true },
    willValidate: false,
    validationMessage: "",
    // `states` is a real `Set` because custom-state selectors add and delete
    // from it during a component's lifecycle; a frozen stand-in would throw.
    states: new Set<string>(),
    checkValidity: () => true,
    reportValidity: () => true,
    setValidity: () => {},
    setFormValue: () => {},
  };
}

const proto = globalThis.HTMLElement?.prototype as
  | (HTMLElement & { attachInternals?: () => unknown })
  | undefined;

if (proto && typeof proto.attachInternals !== "function") {
  Object.defineProperty(proto, "attachInternals", {
    configurable: true,
    writable: true,
    value: stubInternals,
  });
}
