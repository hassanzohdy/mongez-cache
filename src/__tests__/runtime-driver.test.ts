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
 *
 * The item methods stay synchronous; the base engine lifts them into
 * promises, so every driver call below is awaited.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunTimeDriver from "../drivers/RunTimeDriver";

describe("RunTimeDriver — basic API", () => {
  let driver: RunTimeDriver;

  beforeEach(() => {
    driver = new RunTimeDriver();
  });

  afterEach(async () => {
    await driver.clear();
  });

  it("set / get round-trips a string", async () => {
    await driver.set("name", "Hasan");
    expect(await driver.get("name")).toBe("Hasan");
  });

  it("set / get round-trips a number, array, and object", async () => {
    await driver.set("n", 42);
    await driver.set("a", [1, 2, 3]);
    await driver.set("o", { id: 1, name: "Hasan" });
    expect(await driver.get("n")).toBe(42);
    expect(await driver.get("a")).toEqual([1, 2, 3]);
    expect(await driver.get("o")).toEqual({ id: 1, name: "Hasan" });
  });

  it("every storage method returns a promise", () => {
    expect(driver.set("name", "Hasan")).toBeInstanceOf(Promise);
    expect(driver.get("name")).toBeInstanceOf(Promise);
    expect(driver.has("name")).toBeInstanceOf(Promise);
    expect(driver.keys()).toBeInstanceOf(Promise);
    expect(driver.remove("name")).toBeInstanceOf(Promise);
    expect(driver.clear()).toBeInstanceOf(Promise);
  });

  it("returns the default value when the key is missing", async () => {
    expect(await driver.get("ghost", "default")).toBe("default");
  });

  it("overwrite replaces the previous value", async () => {
    await driver.set("name", "Hasan");
    await driver.set("name", "Ali");
    expect(await driver.get("name")).toBe("Ali");
  });

  it("remove() drops the key", async () => {
    await driver.set("name", "Hasan");
    await driver.remove("name");
    expect(await driver.get("name", "default")).toBe("default");
  });

  it("set() resolves with the driver for chaining", async () => {
    expect(await driver.set("a", 1)).toBe(driver);
  });

  it("clear() wipes all entries", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    await driver.set("c", 3);
    await driver.clear();
    expect(await driver.get("a", null)).toBeNull();
    expect(await driver.get("b", null)).toBeNull();
    expect(await driver.get("c", null)).toBeNull();
  });

  it("keys() lists the stored keys", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    expect((await driver.keys()).sort()).toEqual(["a", "b"]);
  });

  it("storage isolation — two driver instances don't share state", async () => {
    const a = new RunTimeDriver();
    const b = new RunTimeDriver();
    await a.set("name", "from-a");
    await b.set("name", "from-b");
    expect(await a.get("name")).toBe("from-a");
    expect(await b.get("name")).toBe("from-b");
  });
});

describe("RunTimeDriver — prefix", () => {
  it("applies the prefix to every key", async () => {
    const driver = new RunTimeDriver();
    driver.setPrefixKey("rt-");
    await driver.set("name", "Hasan");
    // The internal store carries the prefixed key, but the consumer
    // reads with the bare key.
    expect(driver.data.get("rt-name")).toBeDefined();
    expect(await driver.get("name")).toBe("Hasan");
    await driver.clear();
  });

  it("getPrefixKey() returns the configured prefix", () => {
    const driver = new RunTimeDriver();
    driver.setPrefixKey("rt-");
    expect(driver.getPrefixKey()).toBe("rt-");
  });
});

describe("RunTimeDriver — expiration", () => {
  it("expired entries return the default value", async () => {
    vi.useFakeTimers();
    try {
      const driver = new RunTimeDriver();
      await driver.set("name", "Hasan", 1);
      expect(await driver.get("name")).toBe("Hasan");
      vi.advanceTimersByTime(2 * 1000);
      expect(await driver.get("name", "default")).toBe("default");
      await driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  it("entries without expiresAfter survive arbitrarily long", async () => {
    vi.useFakeTimers();
    try {
      const driver = new RunTimeDriver();
      await driver.set("name", "Hasan");
      vi.advanceTimersByTime(60 * 60 * 24 * 365 * 1000);
      expect(await driver.get("name")).toBe("Hasan");
      await driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still-fresh entries read the stored value", async () => {
    vi.useFakeTimers();
    try {
      const driver = new RunTimeDriver();
      await driver.set("name", "Hasan", 60);
      vi.advanceTimersByTime(30 * 1000);
      expect(await driver.get("name", "default")).toBe("Hasan");
      await driver.clear();
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
  it("has() reports false for missing keys", async () => {
    const driver = new RunTimeDriver();
    expect(await driver.has("ghost")).toBe(false);
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

  afterEach(async () => {
    await driver.clear();
  });

  it("has() reports false for inherited object members", async () => {
    for (const key of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "valueOf",
    ]) {
      expect(await driver.has(key)).toBe(false);
    }
  });

  it("get() returns the default value for inherited object members", async () => {
    expect(await driver.get("constructor", "default")).toBe("default");
    expect(await driver.get("toString", "default")).toBe("default");
    expect(await driver.get("__proto__", "default")).toBe("default");
  });

  it("set / get round-trips a `__proto__` key without touching any prototype", async () => {
    await driver.set("__proto__", { polluted: true });

    expect(await driver.get("__proto__")).toEqual({ polluted: true });
    expect(await driver.has("__proto__")).toBe(true);
    // Nothing leaked onto the prototypes of the store, the driver, or
    // plain objects.
    expect(({} as any).polluted).toBeUndefined();
    expect((driver as any).polluted).toBeUndefined();
    expect((driver.data as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(driver.data)).toBe(Map.prototype);
  });

  it("remove() actually deletes a `__proto__` key", async () => {
    await driver.set("__proto__", "value");
    await driver.remove("__proto__");

    expect(await driver.has("__proto__")).toBe(false);
    expect(await driver.get("__proto__", "default")).toBe("default");
  });

  it("set() on `constructor` does not replace the driver's constructor", async () => {
    await driver.set("constructor", "harmless");

    expect(await driver.get("constructor")).toBe("harmless");
    expect(driver.constructor).toBe(RunTimeDriver);
  });

  it("clear() drops prototype-named keys too", async () => {
    await driver.set("__proto__", 1);
    await driver.set("constructor", 2);
    await driver.clear();

    expect(await driver.has("__proto__")).toBe(false);
    expect(await driver.has("constructor")).toBe(false);
    expect(driver.data.size).toBe(0);
  });
});

/**
 * `clear()` is prefix-scoped on every engine, including the runtime one.
 */
describe("RunTimeDriver — prefix-scoped clear()", () => {
  it("clearing one prefix leaves another prefix's keys untouched", async () => {
    const driver = new RunTimeDriver();
    driver.setPrefixKey("app-a-");
    await driver.set("token", "a-token");

    // Same instance, second namespace — the store is shared.
    driver.setPrefixKey("app-b-");
    await driver.set("token", "b-token");

    driver.setPrefixKey("app-a-");
    await driver.clear();

    expect(await driver.get("token", null)).toBeNull();
    expect(driver.data.get("app-b-token")).toBeDefined();

    driver.setPrefixKey("app-b-");
    expect(await driver.get("token")).toBe("b-token");
    await driver.clear();
  });

  it("clear() without a prefix still wipes the whole store", async () => {
    const driver = new RunTimeDriver();
    await driver.set("a", 1);
    await driver.set("b", 2);
    await driver.clear();

    expect(driver.data.size).toBe(0);
  });
});
