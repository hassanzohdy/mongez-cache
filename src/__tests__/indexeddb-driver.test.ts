/**
 * IndexedDBDriver tests.
 *
 * The test environment is happy-dom, which has localStorage but no
 * IndexedDB, so `fake-indexeddb/auto` installs a spec-compliant
 * in-memory implementation on `globalThis` before the driver is
 * imported. That is also why this driver ships as opt-in: plenty of
 * runtimes simply do not have the API.
 */
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCacheConfigurations } from "../config";
import IndexedDBDriver from "../drivers/IndexedDBDriver";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";
import { CacheQuotaExceededError, IndexedDBUnavailableError } from "../errors";

/** Fresh database per describe block so nothing leaks between them. */
function databaseName(suffix: string) {
  return `mongez-cache-test-${suffix}`;
}

async function dropDatabase(driver: IndexedDBDriver) {
  await driver.close();

  await new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase(driver.databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe("IndexedDBDriver — basic API", () => {
  let driver: IndexedDBDriver;

  beforeEach(() => {
    // No global `expiresAfter` — the config singleton is shared.
    setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
    driver = new IndexedDBDriver({ databaseName: databaseName("basic") });
  });

  afterEach(async () => {
    await dropDatabase(driver);
  });

  it("set / get round-trips a string", async () => {
    await driver.set("name", "Hasan");
    expect(await driver.get("name")).toBe("Hasan");
  });

  it("set / get round-trips numbers, arrays, and nested objects", async () => {
    await driver.set("n", 42);
    await driver.set("a", [1, 2, 3]);
    await driver.set("o", { id: 1, profile: { age: 31 } });

    expect(await driver.get("n")).toBe(42);
    expect(await driver.get("a")).toEqual([1, 2, 3]);
    expect(await driver.get("o")).toEqual({ id: 1, profile: { age: 31 } });
  });

  it("round-trips values JSON cannot represent", async () => {
    // IndexedDB stores structured clones, so a Date stays a Date —
    // one of the reasons to reach for this driver over Web Storage.
    const date = new Date("2020-01-02T03:04:05.000Z");
    await driver.set("date", date);
    const stored = await driver.get("date");

    expect(stored).toBeInstanceOf(Date);
    expect((stored as Date).toISOString()).toBe(date.toISOString());

    await driver.set("map", new Map([["a", 1]]));
    expect(await driver.get("map")).toBeInstanceOf(Map);
  });

  it("every storage method returns a promise", () => {
    expect(driver.set("name", "Hasan")).toBeInstanceOf(Promise);
    expect(driver.get("name")).toBeInstanceOf(Promise);
    expect(driver.has("name")).toBeInstanceOf(Promise);
    expect(driver.keys()).toBeInstanceOf(Promise);
    expect(driver.getAll()).toBeInstanceOf(Promise);
    expect(driver.remove("name")).toBeInstanceOf(Promise);
    expect(driver.clear()).toBeInstanceOf(Promise);
  });

  it("get() returns null for a missing key and the default when given", async () => {
    expect(await driver.get("ghost")).toBeNull();
    expect(await driver.get("ghost", "fallback")).toBe("fallback");
  });

  it("has() reports presence", async () => {
    expect(await driver.has("name")).toBe(false);
    await driver.set("name", "Hasan");
    expect(await driver.has("name")).toBe(true);
  });

  it("overwrite replaces the previous value", async () => {
    await driver.set("name", "Hasan");
    await driver.set("name", "Ali");
    expect(await driver.get("name")).toBe("Ali");
  });

  it("remove() drops the key and resolves with the driver", async () => {
    await driver.set("name", "Hasan");
    expect(await driver.remove("name")).toBe(driver);
    expect(await driver.has("name")).toBe(false);
  });

  it("set() resolves with the driver for chaining", async () => {
    expect(await driver.set("a", 1)).toBe(driver);
  });

  it("keys() lists the stored keys", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    expect((await driver.keys()).sort()).toEqual(["a", "b"]);
  });

  it("getAll() returns every live entry", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    expect(await driver.getAll()).toEqual({ a: 1, b: 2 });
  });

  it("clear() empties the store", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    expect(await driver.clear()).toBe(driver);
    expect(await driver.keys()).toEqual([]);
  });

  it("concurrent writes before the database is open all land", async () => {
    // Every operation awaits the same memoized open() promise, so a
    // burst issued at boot must not race into several connections.
    const fresh = new IndexedDBDriver({ databaseName: databaseName("burst") });

    await Promise.all([
      fresh.set("a", 1),
      fresh.set("b", 2),
      fresh.set("c", 3),
    ]);

    expect((await fresh.keys()).sort()).toEqual(["a", "b", "c"]);

    await dropDatabase(fresh);
  });
});

describe("IndexedDBDriver — TTL", () => {
  let driver: IndexedDBDriver;

  beforeEach(() => {
    setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
    driver = new IndexedDBDriver({ databaseName: databaseName("ttl") });
  });

  afterEach(async () => {
    await dropDatabase(driver);
  });

  it("a fresh entry reads back", async () => {
    await driver.set("name", "Hasan", 60);
    expect(await driver.get("name")).toBe("Hasan");
  });

  it("an expired entry returns the default and is evicted", async () => {
    // A negative TTL puts `expiresAt` in the past — deterministic,
    // and no fake timers to fight with IndexedDB's own callbacks.
    await driver.set("name", "Hasan", -1);

    expect(await driver.get("name", "default")).toBe("default");
    // Same self-healing model as the other drivers: the dead entry is
    // dropped on read instead of being left to rot in the database.
    expect(await driver.keys()).toEqual([]);
  });

  it("has() reports an expired entry as absent and evicts it", async () => {
    await driver.set("name", "Hasan", -1);

    expect(await driver.has("name")).toBe(false);
    expect(await driver.keys()).toEqual([]);
  });

  it("getAll() skips expired entries", async () => {
    await driver.set("live", 1);
    await driver.set("dead", 2, -1);

    expect(await driver.getAll()).toEqual({ live: 1 });
  });

  it("an entry with no TTL never expires", async () => {
    await driver.set("name", "Hasan");
    expect(await driver.get("name")).toBe("Hasan");
  });

  it("the global expiresAfter is used when no per-call TTL is passed", async () => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      expiresAfter: -1,
    });

    await driver.set("name", "Hasan");
    expect(await driver.get("name", "default")).toBe("default");

    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      expiresAfter: 0,
    });
  });
});

describe("IndexedDBDriver — prefix scoping", () => {
  let appA: IndexedDBDriver;
  let appB: IndexedDBDriver;

  beforeEach(() => {
    setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
    appA = new IndexedDBDriver({
      databaseName: databaseName("prefix"),
    }).setPrefixKey("app-a-");
    appB = new IndexedDBDriver({
      databaseName: databaseName("prefix"),
    }).setPrefixKey("app-b-");
  });

  afterEach(async () => {
    await appB.close();
    await dropDatabase(appA);
  });

  it("the on-disk key carries the prefix, the caller's key does not", async () => {
    await appA.set("token", "a-token");

    expect(await appA.get("token")).toBe("a-token");
    expect(await appA.keys()).toEqual(["token"]);
  });

  it("clear() only wipes the calling engine's namespace", async () => {
    await appA.set("token", "a-token");
    await appA.set("user", "a-user");
    await appB.set("token", "b-token");

    await appA.clear();

    expect(await appA.get("token", null)).toBeNull();
    expect(await appA.get("user", null)).toBeNull();
    // The neighbour sharing the database keeps its data.
    expect(await appB.get("token")).toBe("b-token");
  });

  it("keys() and getAll() hide the neighbour's entries", async () => {
    await appA.set("token", "a-token");
    await appB.set("token", "b-token");

    expect(await appA.keys()).toEqual(["token"]);
    expect(await appA.getAll()).toEqual({ token: "a-token" });
  });
});

/**
 * Cache keys are caller-controlled, and on a shared origin any script
 * can write a key of its choosing into the database. Keys that name a
 * prototype member must therefore behave as plain data everywhere,
 * including in the bulk read that turns keys back into object
 * properties.
 */
describe("IndexedDBDriver — prototype-polluting keys", () => {
  let driver: IndexedDBDriver;

  beforeEach(() => {
    setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
    driver = new IndexedDBDriver({ databaseName: databaseName("proto") });
  });

  afterEach(async () => {
    await dropDatabase(driver);
  });

  it("round-trips `__proto__` / `constructor` / `prototype` as data", async () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      await driver.set(key, `value-of-${key}`);
      expect(await driver.get(key)).toBe(`value-of-${key}`);
      expect(await driver.has(key)).toBe(true);
    }

    expect(({} as any).polluted).toBeUndefined();
    expect((driver as any).polluted).toBeUndefined();
  });

  it("get() on an unset prototype-named key returns the default", async () => {
    expect(await driver.get("constructor", "default")).toBe("default");
    expect(await driver.has("toString")).toBe(false);
  });

  it("getAll() exposes them as own properties without polluting anything", async () => {
    await driver.set("__proto__", { polluted: true });
    await driver.set("safe", 1);

    const all = await driver.getAll();

    expect(Object.getPrototypeOf(all)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(all, "__proto__")).toBe(true);
    expect(all["__proto__"]).toEqual({ polluted: true });
    expect(all.safe).toBe(1);
    // The prototype of every plain object is untouched.
    expect(({} as any).polluted).toBeUndefined();
    expect((Object.prototype as any).polluted).toBeUndefined();
  });

  it("remove() and clear() drop them like any other key", async () => {
    await driver.set("__proto__", 1);
    await driver.remove("__proto__");
    expect(await driver.has("__proto__")).toBe(false);

    await driver.set("constructor", 1);
    await driver.clear();
    expect(await driver.has("constructor")).toBe(false);
  });
});

describe("IndexedDBDriver — schema version & migration", () => {
  const name = databaseName("migration");

  afterEach(async () => {
    await new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it("creates the store on first open and calls onUpgrade with oldVersion 0", async () => {
    const onUpgrade = vi.fn();
    const driver = new IndexedDBDriver({
      databaseName: name,
      onUpgrade,
    });

    await driver.set("name", "Hasan");

    expect(onUpgrade).toHaveBeenCalledTimes(1);
    const context = onUpgrade.mock.calls[0][0];
    expect(context.oldVersion).toBe(0);
    expect(context.newVersion).toBe(1);
    expect(context.store.name).toBe("cache");

    await driver.close();
  });

  it("a version bump runs onUpgrade and keeps existing entries", async () => {
    const first = new IndexedDBDriver({ databaseName: name });
    await first.set("name", "Hasan");
    await first.close();

    const onUpgrade = vi.fn();
    const second = new IndexedDBDriver({
      databaseName: name,
      version: 2,
      onUpgrade,
    });

    expect(await second.get("name")).toBe("Hasan");
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(onUpgrade.mock.calls[0][0].oldVersion).toBe(1);
    expect(onUpgrade.mock.calls[0][0].newVersion).toBe(2);

    await second.close();
  });

  it("a custom store name isolates two caches in one database", async () => {
    const one = new IndexedDBDriver({
      databaseName: databaseName("stores"),
      storeName: "one",
    });
    await one.set("key", "from-one");

    // A second store in the SAME database needs its own version bump,
    // which is exactly what the version option is for.
    const two = new IndexedDBDriver({
      databaseName: databaseName("stores"),
      storeName: "two",
      version: 2,
    });
    await two.set("key", "from-two");

    expect(await two.get("key")).toBe("from-two");

    await one.close();
    await dropDatabase(two);
  });
});

describe("IndexedDBDriver — environment guard", () => {
  it("isSupported() reflects the presence of indexedDB", () => {
    expect(IndexedDBDriver.isSupported()).toBe(true);
  });

  it("throws a clear error when indexedDB is missing (SSR)", async () => {
    const original = (globalThis as any).indexedDB;

    try {
      // Simulate a server / non-browser runtime.
      (globalThis as any).indexedDB = undefined;

      expect(IndexedDBDriver.isSupported()).toBe(false);

      const driver = new IndexedDBDriver({ databaseName: databaseName("ssr") });

      await expect(driver.get("name")).rejects.toBeInstanceOf(
        IndexedDBUnavailableError
      );
      await expect(driver.set("name", "Hasan")).rejects.toThrow(
        /IndexedDB unavailable/
      );
    } finally {
      (globalThis as any).indexedDB = original;
    }
  });

  it("constructing the driver in a server runtime does not throw", () => {
    const original = (globalThis as any).indexedDB;

    try {
      (globalThis as any).indexedDB = undefined;
      // Construction must stay side-effect free so a module that
      // merely mentions the driver can be bundled for SSR.
      expect(() => new IndexedDBDriver()).not.toThrow();
    } finally {
      (globalThis as any).indexedDB = original;
    }
  });
});

describe("IndexedDBDriver — quota handling", () => {
  let driver: IndexedDBDriver;

  beforeEach(() => {
    setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
    driver = new IndexedDBDriver({ databaseName: databaseName("quota") });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await dropDatabase(driver);
  });

  it("wraps a QuotaExceededError in a CacheQuotaExceededError naming the key", async () => {
    const quotaError = Object.assign(new Error("The quota has been exceeded."), {
      name: "QuotaExceededError",
    });

    vi.spyOn(driver as any, "request").mockRejectedValueOnce(quotaError);

    await expect(driver.set("big", "x".repeat(10))).rejects.toBeInstanceOf(
      CacheQuotaExceededError
    );
  });

  it("the wrapped error keeps the key and the original cause", async () => {
    const quotaError = Object.assign(new Error("full"), {
      name: "QuotaExceededError",
    });

    vi.spyOn(driver as any, "request").mockRejectedValueOnce(quotaError);

    await driver.set("big", 1).catch((error: CacheQuotaExceededError) => {
      expect(error.key).toBe("big");
      expect(error.cause).toBe(quotaError);
      expect(error.message).toContain("big");
    });
  });

  it("a non-quota failure is rethrown untouched", async () => {
    const other = new Error("some other failure");

    vi.spyOn(driver as any, "request").mockRejectedValueOnce(other);

    await expect(driver.set("key", 1)).rejects.toBe(other);
  });

  it("a value that cannot be structured-cloned rejects instead of hanging", async () => {
    await expect(driver.set("fn", () => 1)).rejects.toBeTruthy();
  });
});
