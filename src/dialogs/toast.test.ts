// @vitest-environment happy-dom
//
// Tier-3 component test (see the `repo-layout` spec): the transient toast
// mounts into a polite live region, replaces rather than stacks, and
// auto-dismisses — driven in-process under happy-dom, no browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../test-setup/icons.ts"; // no-fetch wa-icon libraries (avoid teardown AbortError noise)
import { showToast } from "./toast.ts";

const region = () => document.getElementById("app-toast-region");

afterEach(() => {
  region()?.remove();
});

describe("showToast", () => {
  it("mounts a toast inside an aria-live=polite region", () => {
    showToast({ message: "Use Quick-load to return here.", label: "Checkpoint saved" });
    const r = region();
    expect(r).not.toBeNull();
    expect(r?.getAttribute("aria-live")).toBe("polite");
    expect(r?.querySelectorAll("app-toast").length).toBe(1);
  });

  it("replaces an in-flight toast rather than stacking", () => {
    showToast({ message: "first" });
    showToast({ message: "second" });
    const toasts = region()?.querySelectorAll("app-toast");
    expect(toasts?.length).toBe(1);
    expect((toasts?.[0] as HTMLElement & { message: string }).message).toBe("second");
  });

  it("auto-dismisses after its duration", async () => {
    showToast({ message: "transient", duration: 10 });
    expect(region()?.querySelectorAll("app-toast").length).toBe(1);
    // Removal = duration (10ms) + the fade-out fallback (250ms). Poll until
    // it's gone rather than sleeping a fixed margin: a loaded machine that
    // fires the timers late must not flake (and a fast one needn't wait).
    // The budget is deliberately enormous next to the ~260ms it describes —
    // `waitFor` returns the moment the toast goes, so headroom is free, and
    // this box runs deliberately busy.
    await vi.waitFor(
      () => expect(region()?.querySelectorAll("app-toast").length).toBe(0),
      { timeout: 30_000, interval: 20 },
    );
  });
});
