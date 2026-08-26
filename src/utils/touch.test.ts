// @vitest-environment happy-dom
/**
 * `detectSecondaryButton` — the gesture layer, which had no test at all.
 *
 * It is where the *decisions* are made that every per-game input guard then
 * copes with. `input-parity.test.ts` proves a game survives being handed a
 * `RIGHT_BUTTON` it did not expect; nothing proved this makes the right call in
 * the first place, and those are two different guarantees (`audit-input-mode-
 * parity` design D3). The numbers it arbitrates are load-bearing: 350 ms of
 * hold, an 8 px radius, and a second finger that *resets* the timer — so a
 * gesture can be delayed up to twice the hold time.
 *
 * `view-interactive.ts` is the only caller, and it uses both halves of the
 * result: `isSecondary` swaps the button, and `unhandledEvent` replays the
 * `pointerup`/`pointermove` that arrived while this promise was pending —
 * without which a fast tap loses its release entirely.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectSecondaryButton } from "./touch.ts";

const HOLD = 350;

let target: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  target = document.createElement("div");
  document.body.append(target);
});

afterEach(() => {
  vi.useRealTimers();
  target.remove();
});

/**
 * A `PointerEvent` happy-dom will dispatch and `detectSecondaryButton` will
 * accept. It checks `event.target instanceof HTMLElement`, which only holds
 * once the event has actually been dispatched, so `down()` dispatches too.
 */
function pointerEvent(
  type: string,
  init: {
    pointerId?: number;
    pointerType?: string;
    isPrimary?: boolean;
    clientX?: number;
    clientY?: number;
  } = {},
): PointerEvent {
  const {
    pointerId = 1,
    pointerType = "touch",
    isPrimary = true,
    clientX = 100,
    clientY = 100,
  } = init;
  const e = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(e, { pointerId, pointerType, isPrimary, clientX, clientY });
  return e;
}

function down(init?: Parameters<typeof pointerEvent>[1]): PointerEvent {
  const e = pointerEvent("pointerdown", init);
  target.dispatchEvent(e);
  return e;
}

/** Run the detector against `target`, with the production defaults. */
function detect(e: PointerEvent) {
  return detectSecondaryButton(e, { holdTime: HOLD, dragThreshold: 8 });
}

describe("a hold becomes the secondary button", () => {
  it("resolves secondary when the finger stays put past the hold time", async () => {
    const promise = detect(down());
    await vi.advanceTimersByTimeAsync(HOLD + 1);
    // No `unhandledEvent`: nothing arrived to replay, the timer simply fired.
    expect(await promise).toEqual({ isSecondary: true });
  });

  it("resolves primary when the finger lifts first, and hands back the lift", async () => {
    const promise = detect(down());
    await vi.advanceTimersByTimeAsync(HOLD - 50);
    const up = pointerEvent("pointerup");
    target.dispatchEvent(up);
    const result = await promise;
    expect(result.isSecondary).toBe(false);
    // The release must come back, or `view-interactive` never delivers it and
    // the puzzle keeps whatever it shows only while a press is held.
    expect(result.unhandledEvent).toBe(up);
  });

  it("resolves primary as soon as the finger moves past the threshold", async () => {
    const promise = detect(down({ clientX: 100, clientY: 100 }));
    await vi.advanceTimersByTimeAsync(50);
    const move = pointerEvent("pointermove", { clientX: 120, clientY: 100 });
    target.dispatchEvent(move);
    const result = await promise;
    // This is the whole reason a drag survives: the press is released to the
    // game as a LEFT press before the hold timer can promote it.
    expect(result).toEqual({ isSecondary: false, unhandledEvent: move });
  });

  it("treats a wobble inside the threshold as still holding still", async () => {
    const promise = detect(down({ clientX: 100, clientY: 100 }));
    await vi.advanceTimersByTimeAsync(50);
    // 5 px is inside the 8 px radius, so this is still a stationary finger and
    // the hold timer must survive it — otherwise the threshold is really zero
    // and no fingertip could ever hold still enough to reach a right click.
    target.dispatchEvent(pointerEvent("pointermove", { clientX: 104, clientY: 103 }));
    await vi.advanceTimersByTimeAsync(HOLD);
    expect((await promise).isSecondary).toBe(true);
  });
});

describe("what turns detection off", () => {
  it("never promotes a mouse", async () => {
    // The trap this guards: a mouse already has a right button, and a slow
    // click is not a request for it.
    const e = down({ pointerType: "mouse" });
    expect(await detect(e)).toEqual({ isSecondary: false });
  });

  it("never promotes when both affordances are disabled", async () => {
    const e = down();
    expect(
      await detectSecondaryButton(e, { longPress: false, twoFingerTap: false }),
    ).toEqual({ isSecondary: false });
  });

  it("returns immediately rather than holding the press", async () => {
    // Why `Game.ignoresSecondaryButton` switches both flags off rather than
    // ignoring the answer: with detection disabled the press is delivered at
    // once, instead of waiting out the hold window for a verdict nobody wants.
    const e = down();
    let settled = false;
    void detectSecondaryButton(e, { longPress: false, twoFingerTap: false }).then(
      () => {
        settled = true;
      },
    );
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it("with only long-press off, a hold stays primary", async () => {
    const promise = detectSecondaryButton(down(), {
      longPress: false,
      twoFingerTap: true,
      holdTime: HOLD,
    });
    await vi.advanceTimersByTimeAsync(HOLD + 1);
    expect((await promise).isSecondary).toBe(false);
  });
});

describe("a two-finger tap becomes the secondary button", () => {
  it("promotes when a second finger goes down and lifts", async () => {
    const promise = detect(down());
    await vi.advanceTimersByTimeAsync(50);
    window.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 2, isPrimary: false, clientX: 150 }),
    );
    await vi.advanceTimersByTimeAsync(50);
    window.dispatchEvent(
      pointerEvent("pointerup", { pointerId: 2, isPrimary: false, clientX: 150 }),
    );
    expect((await promise).isSecondary).toBe(true);
  });

  it("promotes when the FIRST finger lifts while the second is still down", async () => {
    const promise = detect(down());
    await vi.advanceTimersByTimeAsync(50);
    window.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 2, isPrimary: false, clientX: 150 }),
    );
    const up = pointerEvent("pointerup", { pointerId: 1 });
    target.dispatchEvent(up);
    const result = await promise;
    expect(result.isSecondary).toBe(true);
    expect(result.unhandledEvent).toBe(up);
  });

  it("gives up after the second finger has itself been held too long", async () => {
    // The second finger RESETS the timer, so the whole detection can take up
    // to twice `holdTime` — the documented worst case, asserted so a change to
    // the timer structure has to notice it.
    const promise = detect(down());
    await vi.advanceTimersByTimeAsync(HOLD - 10);
    window.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 2, isPrimary: false, clientX: 150 }),
    );
    await vi.advanceTimersByTimeAsync(10);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled, "resolved at holdTime despite the second finger's reset").toBe(
      false,
    );
    await vi.advanceTimersByTimeAsync(HOLD);
    expect((await promise).isSecondary).toBe(false);
  });

  it("is not a two-finger tap when a third finger joins", async () => {
    const promise = detect(down());
    await vi.advanceTimersByTimeAsync(20);
    for (const id of [2, 3])
      window.dispatchEvent(
        pointerEvent("pointerdown", { pointerId: id, isPrimary: false, clientX: 150 }),
      );
    expect((await promise).isSecondary).toBe(false);
  });

  it("is not a two-finger tap when the second finger drags", async () => {
    const promise = detect(down());
    await vi.advanceTimersByTimeAsync(20);
    window.dispatchEvent(
      pointerEvent("pointerdown", { pointerId: 2, isPrimary: false, clientX: 150 }),
    );
    window.dispatchEvent(
      pointerEvent("pointermove", { pointerId: 2, isPrimary: false, clientX: 200 }),
    );
    expect((await promise).isSecondary).toBe(false);
  });
});

describe("cancellation", () => {
  it("resolves primary on pointercancel, and hands the event back", async () => {
    const promise = detect(down());
    const cancel = pointerEvent("pointercancel");
    target.dispatchEvent(cancel);
    expect(await promise).toEqual({ isSecondary: false, unhandledEvent: cancel });
  });

  it("rejects an initial event that is not a primary pointerdown", async () => {
    const move = pointerEvent("pointermove");
    target.dispatchEvent(move);
    await expect(detect(move)).rejects.toThrow(TypeError);
  });
});
