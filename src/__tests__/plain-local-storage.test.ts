/**
 * PlainLocalStorageDriver tests.
 *
 * Covers the basic contract every driver shares — set / get / has /
 * remove / clear / prefix — exercised directly against the
 * localStorage backend without going through the CacheManager facade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";

describe("PlainLocalStorageDriver — basic API", () => {
  let driver: PlainLocalStorageDriver;

  beforeEach(() => {
    driver = new PlainLocalStorageDriver();
  });

  afterEach(() => {
    driver.clear();
  });

  it("set / get round-trips a string", () => {
    driver.set("name", "Hasan");
    expect(driver.get("name")).toBe("Hasan");
  });

  it("set / get round-trips a number", () => {
    driver.set("age", 31);
    expect(driver.get("age")).toBe(31);
  });

  it("set / get round-trips a boolean", () => {
    driver.set("flag", true);
    expect(driver.get("flag")).toBe(true);
    driver.set("flag", false);
    expect(driver.get("flag")).toBe(false);
  });

  it("set / get round-trips an array", () => {
    const letters = ["a", "b", "c"];
    driver.set("letters", letters);
    expect(driver.get("letters")).toEqual(letters);
  });

  it("set / get round-trips a nested object", () => {
    const user = { id: 1, name: "Hasan", roles: ["admin"], profile: { age: 31 } };
    driver.set("user", user);
    expect(driver.get("user")).toEqual(user);
  });

  it("returns undefined for a missing key when no default is given", () => {
    expect(driver.get("ghost")).toBeUndefined();
  });

  it("returns the default value for a missing key", () => {
    expect(driver.get("ghost", "fallback")).toBe("fallback");
  });

  it("ignores the default value once a real value is stored", () => {
    driver.set("name", "Hasan");
    expect(driver.get("name", "fallback")).toBe("Hasan");
  });

  it("set() returns the driver for chaining", () => {
    const result = driver.set("a", 1);
    expect(result).toBe(driver);
  });

  it("remove() drops the key", () => {
    driver.set("name", "Hasan");
    driver.remove("name");
    expect(driver.get("name", null)).toBeNull();
    expect(driver.has("name")).toBe(false);
  });

  it("remove() returns the driver for chaining", () => {
    driver.set("name", "Hasan");
    const result = driver.remove("name");
    expect(result).toBe(driver);
  });

  it("remove() on a missing key is a no-op", () => {
    expect(() => driver.remove("ghost")).not.toThrow();
  });

  it("has() reports presence correctly", () => {
    expect(driver.has("name")).toBe(false);
    driver.set("name", "Hasan");
    expect(driver.has("name")).toBe(true);
    driver.remove("name");
    expect(driver.has("name")).toBe(false);
  });

  it("overwrite replaces the previous value", () => {
    driver.set("name", "Hasan");
    driver.set("name", "Ali");
    expect(driver.get("name")).toBe("Ali");
  });

  it("clear() wipes every key from the underlying storage", () => {
    driver.set("a", 1);
    driver.set("b", 2);
    driver.set("c", 3);
    driver.clear();
    expect(driver.has("a")).toBe(false);
    expect(driver.has("b")).toBe(false);
    expect(driver.has("c")).toBe(false);
  });
});

describe("PlainLocalStorageDriver — prefix", () => {
  it("getPrefixKey() returns the empty string by default", () => {
    const driver = new PlainLocalStorageDriver();
    expect(driver.getPrefixKey()).toBe("");
  });

  it("setPrefixKey() applies a prefix to every key on disk", () => {
    const driver = new PlainLocalStorageDriver();
    driver.setPrefixKey("app-");
    driver.set("name", "Hasan");
    // The on-disk key carries the prefix...
    expect(localStorage.getItem("app-name")).not.toBeNull();
    // ...but the consumer reads with the bare key.
    expect(driver.get("name")).toBe("Hasan");
    driver.remove("name");
  });

  it("setPrefixKey() returns the driver for chaining", () => {
    const driver = new PlainLocalStorageDriver();
    const result = driver.setPrefixKey("app-");
    expect(result).toBe(driver);
  });

  it("changing the prefix isolates keys", () => {
    const a = new PlainLocalStorageDriver();
    a.setPrefixKey("app-a-");
    a.set("name", "from-a");

    const b = new PlainLocalStorageDriver();
    b.setPrefixKey("app-b-");
    b.set("name", "from-b");

    expect(a.get("name")).toBe("from-a");
    expect(b.get("name")).toBe("from-b");

    a.remove("name");
    b.remove("name");
  });
});

describe("PlainLocalStorageDriver — expiration", () => {
  it("a value with no expiresAfter survives time travel", () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      driver.set("name", "Hasan");
      vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 365 * 10); // 10 years
      expect(driver.get("name")).toBe("Hasan");
      driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a value with a short expiresAfter is gone after the window", () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      driver.set("name", "Hasan", 60); // 60 seconds
      expect(driver.get("name")).toBe("Hasan");
      vi.advanceTimersByTime(61 * 1000);
      // Past the expiry window — the next read drops the entry and
      // returns the default value (undefined when omitted).
      expect(driver.get("name")).toBeUndefined();
      expect(driver.has("name")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("expired entries return the default value when one is supplied", () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      driver.set("name", "Hasan", 1);
      vi.advanceTimersByTime(2 * 1000);
      expect(driver.get("name", "default")).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a still-fresh value reads the stored value, not the default", () => {
    vi.useFakeTimers();
    try {
      const driver = new PlainLocalStorageDriver();
      driver.set("name", "Hasan", 60);
      vi.advanceTimersByTime(30 * 1000);
      expect(driver.get("name", "default")).toBe("Hasan");
      driver.clear();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PlainLocalStorageDriver — value parser & converter", () => {
  it("setValueConverter overrides the default JSON.stringify", () => {
    const driver = new PlainLocalStorageDriver();
    // Custom converter that wraps in a sentinel.
    driver.setValueConverter((v: any) => "::" + JSON.stringify(v));
    driver.setValueParser((v: any) => JSON.parse(v.slice(2)));
    driver.set("name", "Hasan");
    expect(localStorage.getItem("name")!.startsWith("::")).toBe(true);
    expect(driver.get("name")).toBe("Hasan");
    driver.clear();
  });

  it("setValueConverter / setValueParser return the driver for chaining", () => {
    const driver = new PlainLocalStorageDriver();
    expect(driver.setValueConverter((v: any) => v)).toBe(driver);
    expect(driver.setValueParser((v: any) => v)).toBe(driver);
  });

  it("a corrupted on-disk value is read as undefined", () => {
    // The default parser swallows JSON errors and returns the raw
    // string, so a malformed value parses to a string whose `.data`
    // property is undefined. The driver returns that undefined.
    const driver = new PlainLocalStorageDriver();
    localStorage.setItem("broken", "{not valid json");
    expect(driver.get("broken")).toBeUndefined();
    driver.clear();
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
  it("clearing one engine leaves another engine's prefixed keys intact", () => {
    const appA = new PlainLocalStorageDriver().setPrefixKey("app-a-");
    const appB = new PlainLocalStorageDriver().setPrefixKey("app-b-");

    appA.set("token", "a-token");
    appA.set("user", "a-user");
    appB.set("token", "b-token");
    appB.set("user", "b-user");

    appA.clear();

    expect(appA.get("token", null)).toBeNull();
    expect(appA.get("user", null)).toBeNull();
    expect(appB.get("token")).toBe("b-token");
    expect(appB.get("user")).toBe("b-user");

    appB.clear();
  });

  it("leaves unprefixed third-party keys alone", () => {
    const driver = new PlainLocalStorageDriver().setPrefixKey("app-");
    localStorage.setItem("someone-elses-token", "keep-me");
    driver.set("name", "Hasan");

    driver.clear();

    expect(localStorage.getItem("someone-elses-token")).toBe("keep-me");
    expect(driver.get("name", null)).toBeNull();
    localStorage.removeItem("someone-elses-token");
  });

  it("removes every key of the prefix, however many there are", () => {
    const driver = new PlainLocalStorageDriver().setPrefixKey("bulk-");

    for (let index = 0; index < 10; index++) {
      driver.set(`key-${index}`, index);
    }

    localStorage.setItem("outsider", "keep-me");
    driver.clear();

    for (let index = 0; index < 10; index++) {
      expect(driver.has(`key-${index}`)).toBe(false);
    }

    // Removing while iterating a live Web Storage index would have
    // skipped half of the keys and left the outsider count wrong.
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem("outsider")).toBe("keep-me");
    localStorage.removeItem("outsider");
  });

  it("clear() without a prefix keeps wiping the whole storage", () => {
    const driver = new PlainLocalStorageDriver();
    localStorage.setItem("someone-elses-token", "bye");
    driver.set("name", "Hasan");

    driver.clear();

    expect(localStorage.length).toBe(0);
  });

  it("clear() returns the driver for chaining", () => {
    const driver = new PlainLocalStorageDriver().setPrefixKey("chain-");
    expect(driver.clear()).toBe(driver);
  });
});
