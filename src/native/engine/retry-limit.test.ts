import { describe, expect, it } from "vitest";
import { MAX_REGENERATE, RetryLimitExceeded, retryLimit } from "./retry-limit.ts";

describe("retryLimit", () => {
  it("allows exactly `max` attempts before giving up", () => {
    const attempt = retryLimit("t", 3);
    expect(() => {
      attempt();
      attempt();
      attempt();
    }).not.toThrow();
    expect(() => attempt()).toThrow(RetryLimitExceeded);
  });

  it("bounds a loop that never succeeds", () => {
    let rounds = 0;
    expect(() => {
      const attempt = retryLimit("tents: generation", 7);
      for (;;) {
        attempt();
        rounds++;
      }
    }).toThrow(RetryLimitExceeded);
    expect(rounds).toBe(7);
  });

  it("names the loop and the budget in the message", () => {
    let err: unknown;
    try {
      const attempt = retryLimit("net: shuffle", 5);
      for (;;) attempt();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RetryLimitExceeded);
    expect((err as RetryLimitExceeded).label).toBe("net: shuffle");
    expect((err as RetryLimitExceeded).max).toBe(5);
    expect((err as Error).message).toBe("net: shuffle: gave up after 5 attempts");
    expect((err as Error).name).toBe("RetryLimitExceeded");
  });

  it("never fires for a loop that succeeds within budget", () => {
    let rounds = 0;
    expect(() => {
      const attempt = retryLimit("t", 1000);
      for (;;) {
        attempt();
        if (++rounds === 3) break;
      }
    }).not.toThrow();
    expect(rounds).toBe(3);
  });

  it("gives each guard an independent budget", () => {
    const outer = retryLimit("outer", 2);
    const inner = retryLimit("inner", 2);
    outer();
    inner();
    inner();
    // `inner` is spent; `outer` still has an attempt left.
    expect(() => inner()).toThrow(RetryLimitExceeded);
    expect(() => outer()).not.toThrow();
  });

  it("defaults to the house budget", () => {
    let rounds = 0;
    expect(() => {
      const attempt = retryLimit("t");
      for (;;) {
        attempt();
        rounds++;
      }
    }).toThrow(RetryLimitExceeded);
    expect(rounds).toBe(MAX_REGENERATE);
  });
});
