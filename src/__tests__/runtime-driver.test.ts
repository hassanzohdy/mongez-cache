/**
 * RunTimeDriver tests.
 *
 * The runtime driver is the simplest one — an in-memory object that
 * forgets everything when the page unloads. We still exercise the full
 * driver contract here so changes to the BaseCacheEngine "double-wrap"
 * path are caught.
 *
 * Implementation note: `storage = this` on the runtime driver, so the
 * base engine routes `storage.setItem(...)` back into the runtime's
 * own setItem. The base engine wraps every value in `{data, expiresAt}`
 * and then `setItem` wraps that envelope a second time in
 * `{value, expiresAt}`. Effectively the outer expiry slot is always
 * undefined and the inner envelope drives the expiry check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunTimeDriver from "../drivers/RunTimeDriver";

describe("RunTimeDriver — basic API", () => {
  let driver: RunTimeDriver;

  beforeEach(() => {
    driver = new RunTimeDriver();
  });

  afterEach(() => {
    driver.clear();
  });

  it("set / get round-trips a string", () => {
    driver.set("name", "Hasan");
    expect(driver.get("name")).toBe("Hasan");
  });

  it("set / get round-trips a number, array, and object", () => {
    driver.set("n", 42);
    driver.set("a", [1, 2, 3]);
    driver.set("o", { id: 1, name: "Hasan" });
    expect(driver.get("n")).toBe(42);
    expect(driver.get("a")).toEqual([1, 2, 3]);
    expect(driver.get("o")).toEqual({ id: 1, name: "Hasan" });
  });

  it("returns the default value when the key is missing", () => {
    expect(driver.get("ghost", "default")).toBe("default");
  });

  it("overwrite replaces the previous value", () => {
    driver.set("name", "Hasan");
    driver.set("name", "Ali");
    expect(driver.get("name")).toBe("Ali");
  });

  it("remove() drops the key", () => {
    driver.set("name", "Hasan");
    driver.remove("name");
    expect(driver.get("name", "default")).toBe("default");
  });

  it("set() returns the driver for chaining", () => {
    expect(driver.set("a", 1)).toBe(driver);
  });

  it("clear() wipes all entries", () => {
    driver.set("a", 1);
    driver.set("b", 2);
    driver.set("c", 3);
    driver.clear();
    expect(driver.get("a", null)).toBeNull();
    expect(driver.get("b", null)).toBeNull();
    expect(driver.get("c", null)).toBeNull();
  });

  it("storage isolation — two driver instances don't share state", () => {
    const a = new RunTimeDriver();
    const b = new RunTimeDriver();
    a.set("name", "from-a");
    b.set("name", "from-b");
    expect(a.get("name")).toBe("from-a");
    expect(b.get("name")).toBe("from-b");
  });
});

describe("RunTimeDriver — prefix", () => {
  it("applies the prefix to every key", () => {
    const driver = new RunTimeDriver();
    driver.setPrefixKey("rt-");
    driver.set("name", "Hasan");
    // The internal store carries the prefixed key, but the consumer
    // reads with the bare key.
    expect(driver.data.get("rt-name")).toBeDefined();
    expect(driver.get("name")).toBe("Hasan");
    driver.clear();
  });

  it("getPrefixKey() returns the configured prefix", () => {
    const driver = new RunTimeDriver();
    driver.setPrefixKey("rt-");
    expect(driver.getPrefixKey()).toBe("rt-");
  });
});

describe("RunTimeDriver — expiration", () => {
  it("expired entries return the default value", () => {
    vi.useFakeTimers();
    try {
      const driver = new RunTimeDriver();
      driver.set("name", "Hasan", 1);
      expect(driver.get("name")).toBe("Hasan");
      vi.advanceTimersByTime(2 * 1000);
      expect(driver.get("name", "default")).toBe("default");
      driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  it("entries without expiresAfter survive arbitrarily long", () => {
    vi.useFakeTimers();
    try {
      const driver = new RunTimeDriver();
      driver.set("name", "Hasan");
      vi.advanceTimersByTime(60 * 60 * 24 * 365 * 1000);
      expect(driver.get("name")).toBe("Hasan");
      driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still-fresh entries read the stored value", () => {
    vi.useFakeTimers();
    try {
      const driver = new RunTimeDriver();
      driver.set("name", "Hasan", 60);
      vi.advanceTimersByTime(30 * 1000);
      expect(driver.get("name", "default")).toBe("Hasan");
      driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });
});

// Previously skipped — fixed in this release.
//
// `RunTimeDriver.getItem` now returns `null` (not `undefined`) for
// missing keys, aligning it with the Web Storage API contract and
// fixing `BaseCacheEngine.has()` for this driver.
//
// File: src/drivers/RunTimeDriver.ts
describe("RunTimeDriver — has() on missing keys", () => {
  it("has() reports false for missing keys", () => {
    const driver = new RunTimeDriver();
    expect(driver.has("ghost")).toBe(false);
  });
});

/**
 * Regression tests for the prototype-chain confusion the plain-object
 * store used to allow. The store is a `Map` now, so keys that happen to
 * name an `Object.prototype` member are ordinary data.
 */
describe("RunTimeDriver — prototype-polluting keys", () => {
  let driver: RunTimeDriver;

  beforeEach(() => {
    driver = new RunTimeDriver();
  });

  afterEach(() => {
    driver.clear();
  });

  it("has() reports false for inherited object members", () => {
    for (const key of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "valueOf",
    ]) {
      expect(driver.has(key)).toBe(false);
    }
  });

  it("get() returns the default value for inherited object members", () => {
    expect(driver.get("constructor", "default")).toBe("default");
    expect(driver.get("toString", "default")).toBe("default");
    expect(driver.get("__proto__", "default")).toBe("default");
  });

  it("set / get round-trips a `__proto__` key without touching any prototype", () => {
    driver.set("__proto__", { polluted: true });

    expect(driver.get("__proto__")).toEqual({ polluted: true });
    expect(driver.has("__proto__")).toBe(true);
    // Nothing leaked onto the prototypes of the store, the driver, or
    // plain objects.
    expect(({} as any).polluted).toBeUndefined();
    expect((driver as any).polluted).toBeUndefined();
    expect((driver.data as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(driver.data)).toBe(Map.prototype);
  });

  it("remove() actually deletes a `__proto__` key", () => {
    driver.set("__proto__", "value");
    driver.remove("__proto__");

    expect(driver.has("__proto__")).toBe(false);
    expect(driver.get("__proto__", "default")).toBe("default");
  });

  it("set() on `constructor` does not replace the driver's constructor", () => {
    driver.set("constructor", "harmless");

    expect(driver.get("constructor")).toBe("harmless");
    expect(driver.constructor).toBe(RunTimeDriver);
  });

  it("clear() drops prototype-named keys too", () => {
    driver.set("__proto__", 1);
    driver.set("constructor", 2);
    driver.clear();

    expect(driver.has("__proto__")).toBe(false);
    expect(driver.has("constructor")).toBe(false);
    expect(driver.data.size).toBe(0);
  });
});

/**
 * `clear()` is prefix-scoped on every engine, including the runtime one.
 */
describe("RunTimeDriver — prefix-scoped clear()", () => {
  it("clearing one prefix leaves another prefix's keys untouched", () => {
    const driver = new RunTimeDriver();
    driver.setPrefixKey("app-a-");
    driver.set("token", "a-token");

    // Same instance, second namespace — the store is shared.
    driver.setPrefixKey("app-b-");
    driver.set("token", "b-token");

    driver.setPrefixKey("app-a-");
    driver.clear();

    expect(driver.get("token", null)).toBeNull();
    expect(driver.data.get("app-b-token")).toBeDefined();

    driver.setPrefixKey("app-b-");
    expect(driver.get("token")).toBe("b-token");
    driver.clear();
  });

  it("clear() without a prefix still wipes the whole store", () => {
    const driver = new RunTimeDriver();
    driver.set("a", 1);
    driver.set("b", 2);
    driver.clear();

    expect(driver.data.size).toBe(0);
  });
});
