/**
 * PlainLocalStorageDriver tests.
 *
 * Covers the basic contract every driver shares — set / get / has /
 * remove / clear / keys / prefix — exercised directly against the
 * localStorage backend without going through the CacheManager facade.
 *
 * Every storage method is async as of 2.0.0, even though localStorage
 * itself answers synchronously, so each call is awaited.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";

describe("PlainLocalStorageDriver — basic API", () => {
  let driver: PlainLocalStorageDriver;

  beforeEach(() => {
    driver = new PlainLocalStorageDriver();
  });

  afterEach(async () => {
    await driver.clear();
  });

  it("set / get round-trips a string", async () => {
    await driver.set("name", "Hasan");
    expect(await driver.get("name")).toBe("Hasan");
  });

  it("set / get round-trips a number", async () => {
    await driver.set("age", 31);
    expect(await driver.get("age")).toBe(31);
  });

  it("set / get round-trips a boolean", async () => {
    await driver.set("flag", true);
    expect(await driver.get("flag")).toBe(true);
    await driver.set("flag", false);
    expect(await driver.get("flag")).toBe(false);
  });

  it("set / get round-trips an array", async () => {
    const letters = ["a", "b", "c"];
    await driver.set("letters", letters);
    expect(await driver.get("letters")).toEqual(letters);
  });

  it("set / get round-trips a nested object", async () => {
    const user = { id: 1, name: "Hasan", roles: ["admin"], profile: { age: 31 } };
    await driver.set("user", user);
    expect(await driver.get("user")).toEqual(user);
  });

  it("every storage method returns a promise", () => {
    // The async contract is what lets a consumer swap this driver for
    // the IndexedDB one without touching a call site.
    expect(driver.set("name", "Hasan")).toBeInstanceOf(Promise);
    expect(driver.get("name")).toBeInstanceOf(Promise);
    expect(driver.has("name")).toBeInstanceOf(Promise);
    expect(driver.keys()).toBeInstanceOf(Promise);
    expect(driver.remove("name")).toBeInstanceOf(Promise);
    expect(driver.clear()).toBeInstanceOf(Promise);
  });

  it("returns undefined for a missing key when no default is given", async () => {
    expect(await driver.get("ghost")).toBeUndefined();
  });

  it("returns the default value for a missing key", async () => {
    expect(await driver.get("ghost", "fallback")).toBe("fallback");
  });

  it("ignores the default value once a real value is stored", async () => {
    await driver.set("name", "Hasan");
    expect(await driver.get("name", "fallback")).toBe("Hasan");
  });

  it("set() resolves with the driver for chaining", async () => {
    const result = await driver.set("a", 1);
    expect(result).toBe(driver);
  });

  it("remove() drops the key", async () => {
    await driver.set("name", "Hasan");
    await driver.remove("name");
    expect(await driver.get("name", null)).toBeNull();
    expect(await driver.has("name")).toBe(false);
  });

  it("remove() resolves with the driver for chaining", async () => {
    await driver.set("name", "Hasan");
    const result = await driver.remove("name");
    expect(result).toBe(driver);
  });

  it("remove() on a missing key is a no-op", async () => {
    await expect(driver.remove("ghost")).resolves.toBe(driver);
  });

  it("has() reports presence correctly", async () => {
    expect(await driver.has("name")).toBe(false);
    await driver.set("name", "Hasan");
    expect(await driver.has("name")).toBe(true);
    await driver.remove("name");
    expect(await driver.has("name")).toBe(false);
  });

  it("overwrite replaces the previous value", async () => {
    await driver.set("name", "Hasan");
    await driver.set("name", "Ali");
    expect(await driver.get("name")).toBe("Ali");
  });

  it("clear() wipes every key from the underlying storage", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    await driver.set("c", 3);
    await driver.clear();
    expect(await driver.has("a")).toBe(false);
    expect(await driver.has("b")).toBe(false);
    expect(await driver.has("c")).toBe(false);
  });

  it("keys() lists the stored keys", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    expect((await driver.keys()).sort()).toEqual(["a", "b"]);
  });
});

describe("PlainLocalStorageDriver — prefix", () => {
  it("getPrefixKey() returns the empty string by default", () => {
    const driver = new PlainLocalStorageDriver();
    expect(driver.getPrefixKey()).toBe("");
  });

  it("setPrefixKey() applies a prefix to every key on disk", async () => {
    const driver = new PlainLocalStorageDriver();
    driver.setPrefixKey("app-");
    await driver.set("name", "Hasan");
    // The on-disk key carries the prefix...
    expect(localStorage.getItem("app-name")).not.toBeNull();
    // ...but the consumer reads with the bare key.
    expect(await driver.get("name")).toBe("Hasan");
    await driver.remove("name");
  });

  it("setPrefixKey() returns the driver for chaining — it stays synchronous", () => {
    const driver = new PlainLocalStorageDriver();
    const result = driver.setPrefixKey("app-");
    expect(result).toBe(driver);
  });

  it("keys() strips the prefix and hides foreign keys", async () => {
    const driver = new PlainLocalStorageDriver().setPrefixKey("app-");
    await driver.set("name", "Hasan");
    localStorage.setItem("someone-else", "keep-me");

    expect(await driver.keys()).toEqual(["name"]);

    await driver.clear();
    localStorage.removeItem("someone-else");
  });

  it("changing the prefix isolates keys", async () => {
    const a = new PlainLocalStorageDriver();
    a.setPrefixKey("app-a-");
    await a.set("name", "from-a");

    const b = new PlainLocalStorageDriver();
    b.setPrefixKey("app-b-");
    await b.set("name", "from-b");

    expect(await a.get("name")).toBe("from-a");
    expect(await b.get("name")).toBe("from-b");

    await a.remove("name");
    await b.remove("name");
  });
});

describe("PlainLocalStorageDriver — expiration", () => {
  it("a value with no expiresAfter survives time travel", async () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      await driver.set("name", "Hasan");
      vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 365 * 10); // 10 years
      expect(await driver.get("name")).toBe("Hasan");
      await driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a value with a short expiresAfter is gone after the window", async () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      await driver.set("name", "Hasan", 60); // 60 seconds
      expect(await driver.get("name")).toBe("Hasan");
      vi.advanceTimersByTime(61 * 1000);
      // Past the expiry window — the next read drops the entry and
      // returns the default value (undefined when omitted).
      expect(await driver.get("name")).toBeUndefined();
      expect(await driver.has("name")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("has() reports an expired entry as absent and evicts it", async () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      await driver.set("name", "Hasan", 1);
      vi.advanceTimersByTime(2 * 1000);
      // 2.0.0: has() is TTL-aware on every driver, so it can no longer
      // disagree with the get() that follows it.
      expect(await driver.has("name")).toBe(false);
      expect(localStorage.getItem("name")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("expired entries return the default value when one is supplied", async () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      await driver.set("name", "Hasan", 1);
      vi.advanceTimersByTime(2 * 1000);
      expect(await driver.get("name", "default")).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a still-fresh value reads the stored value, not the default", async () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      await driver.set("name", "Hasan", 60);
      vi.advanceTimersByTime(30 * 1000);
      expect(await driver.get("name", "default")).toBe("Hasan");
      await driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PlainLocalStorageDriver — value parser & converter", () => {
  it("setValueConverter overrides the default JSON.stringify", async () => {
    const driver = new PlainLocalStorageDriver();
    // Custom converter that wraps in a sentinel.
    driver.setValueConverter((v: any) => "::" + JSON.stringify(v));
    driver.setValueParser((v: any) => JSON.parse(v.slice(2)));
    await driver.set("name", "Hasan");
    expect(localStorage.getItem("name")!.startsWith("::")).toBe(true);
    expect(await driver.get("name")).toBe("Hasan");
    await driver.clear();
  });

  it("setValueConverter / setValueParser return the driver for chaining", () => {
    const driver = new PlainLocalStorageDriver();
    expect(driver.setValueConverter((v: any) => v)).toBe(driver);
    expect(driver.setValueParser((v: any) => v)).toBe(driver);
  });

  it("a corrupted on-disk value is read as undefined", async () => {
    // The default parser swallows JSON errors and returns the raw
    // string, so a malformed value parses to a string whose `.data`
    // property is undefined. The driver returns that undefined.
    const driver = new PlainLocalStorageDriver();
    localStorage.setItem("broken", "{not valid json");
    expect(await driver.get("broken")).toBeUndefined();
    await driver.clear();
  });
});

/**
 * `clear()` must stay inside the engine's own prefix namespace.
 *
 * localStorage is shared by every script on the origin, so a `clear()`
 * that wipes the whole backend destroys other apps' data (auth tokens
 * included) even though the prefix feature promises coexistence.
 */
describe("PlainLocalStorageDriver — prefix-scoped clear()", () => {
  it("clearing one engine leaves another engine's prefixed keys intact", async () => {
    const appA = new PlainLocalStorageDriver().setPrefixKey("app-a-");
    const appB = new PlainLocalStorageDriver().setPrefixKey("app-b-");

    await appA.set("token", "a-token");
    await appA.set("user", "a-user");
    await appB.set("token", "b-token");
    await appB.set("user", "b-user");

    await appA.clear();

    expect(await appA.get("token", null)).toBeNull();
    expect(await appA.get("user", null)).toBeNull();
    expect(await appB.get("token")).toBe("b-token");
    expect(await appB.get("user")).toBe("b-user");

    await appB.clear();
  });

  it("leaves unprefixed third-party keys alone", async () => {
    const driver = new PlainLocalStorageDriver().setPrefixKey("app-");
    localStorage.setItem("someone-elses-token", "keep-me");
    await driver.set("name", "Hasan");

    await driver.clear();

    expect(localStorage.getItem("someone-elses-token")).toBe("keep-me");
    expect(await driver.get("name", null)).toBeNull();
    localStorage.removeItem("someone-elses-token");
  });

  it("removes every key of the prefix, however many there are", async () => {
    const driver = new PlainLocalStorageDriver().setPrefixKey("bulk-");

    for (let index = 0; index < 10; index++) {
      await driver.set(`key-${index}`, index);
    }

    localStorage.setItem("outsider", "keep-me");
    await driver.clear();

    for (let index = 0; index < 10; index++) {
      expect(await driver.has(`key-${index}`)).toBe(false);
    }

    // Removing while iterating a live Web Storage index would have
    // skipped half of the keys and left the outsider count wrong.
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("outsider")).toBe("keep-me");
    localStorage.removeItem("outsider");
  });

  it("clear() without a prefix keeps wiping the whole storage", async () => {
    const driver = new PlainLocalStorageDriver();
    localStorage.setItem("someone-elses-token", "bye");
    await driver.set("name", "Hasan");

    await driver.clear();

    expect(localStorage.length).toBe(0);
  });

  it("clear() resolves with the driver for chaining", async () => {
    const driver = new PlainLocalStorageDriver().setPrefixKey("chain-");
    expect(await driver.clear()).toBe(driver);
  });
});
