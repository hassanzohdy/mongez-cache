/**
 * EncryptedLocalStorageDriver tests.
 *
 * The encrypted driver overrides `set` / `get` / `remove` to route
 * values through the encrypt/decrypt functions configured via
 * `setCacheConfigurations({ encryption: { encrypt, decrypt } })`. We
 * stub those with reversible transforms so the assertions can verify
 * that an encrypt happens on `set` and a decrypt happens on `get`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCacheConfigurations } from "../config";
import EncryptedLocalStorageDriver from "../drivers/EncryptedLocalStorageDriver";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";

/** Reversible "encryption" — just a base64 round-trip wrapped around JSON. */
function fakeEncrypt(value: any): string {
  return "enc::" + Buffer.from(JSON.stringify(value)).toString("base64");
}

function fakeDecrypt(cypher: string): any {
  if (!cypher.startsWith("enc::")) return null;
  return JSON.parse(Buffer.from(cypher.slice(5), "base64").toString("utf8"));
}

describe("EncryptedLocalStorageDriver", () => {
  let driver: EncryptedLocalStorageDriver;
  const encrypt = vi.fn(fakeEncrypt);
  const decrypt = vi.fn(fakeDecrypt);

  beforeEach(() => {
    encrypt.mockClear();
    decrypt.mockClear();
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      encryption: { encrypt, decrypt },
    });
    driver = new EncryptedLocalStorageDriver();
  });

  afterEach(() => {
    driver.clear();
  });

  it("set() calls encrypt before writing", () => {
    driver.set("name", "Hasan");
    // The driver wraps the value in a `{data, expiresAt}` envelope
    // before encrypting so that TTL works the same way as in the
    // plain drivers.
    expect(encrypt).toHaveBeenCalledWith({
      data: "Hasan",
      expiresAt: undefined,
    });
    expect(encrypt).toHaveBeenCalledTimes(1);
  });

  it("get() calls decrypt and returns the original value", () => {
    driver.set("name", "Hasan");
    expect(driver.get("name")).toBe("Hasan");
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("set / get round-trips strings, numbers, arrays, and objects", () => {
    driver.set("s", "Hasan");
    driver.set("n", 42);
    driver.set("a", [1, 2, 3]);
    driver.set("o", { id: 1, name: "Hasan" });

    expect(driver.get("s")).toBe("Hasan");
    expect(driver.get("n")).toBe(42);
    expect(driver.get("a")).toEqual([1, 2, 3]);
    expect(driver.get("o")).toEqual({ id: 1, name: "Hasan" });
  });

  it("get() returns the on-disk value through decrypt, not the raw cypher", () => {
    driver.set("name", "Hasan");
    const rawDisk = localStorage.getItem("name");
    // The disk holds the cypher, not the plain value.
    expect(rawDisk).not.toBe("Hasan");
    expect(rawDisk).toMatch(/^enc::/);
  });

  it("get() returns the default value when the key is missing", () => {
    expect(driver.get("ghost", "fallback")).toBe("fallback");
  });

  it("get() returns null when the key is missing and no default is given", () => {
    expect(driver.get("ghost")).toBeNull();
  });

  it("remove() drops the key from storage", () => {
    driver.set("name", "Hasan");
    driver.remove("name");
    expect(driver.has("name")).toBe(false);
    expect(driver.get("name", null)).toBeNull();
  });

  it("set() returns the driver for chaining", () => {
    expect(driver.set("a", 1)).toBe(driver);
  });

  it("remove() returns the driver for chaining", () => {
    driver.set("a", 1);
    expect(driver.remove("a")).toBe(driver);
  });

  it("overwriting a key updates the stored cypher", () => {
    driver.set("name", "Hasan");
    const firstCypher = localStorage.getItem("name");
    driver.set("name", "Ali");
    const secondCypher = localStorage.getItem("name");
    expect(firstCypher).not.toBe(secondCypher);
    expect(driver.get("name")).toBe("Ali");
  });

  it("clear() wipes all keys", () => {
    driver.set("a", 1);
    driver.set("b", 2);
    driver.clear();
    expect(driver.has("a")).toBe(false);
    expect(driver.has("b")).toBe(false);
  });

  it("respects a configured prefix on every operation", () => {
    driver.setPrefixKey("enc-");
    driver.set("name", "Hasan");
    // On-disk key carries the prefix.
    expect(localStorage.getItem("enc-name")).not.toBeNull();
    expect(driver.get("name")).toBe("Hasan");
    driver.remove("name");
    expect(driver.has("name")).toBe(false);
  });

  // Previously skipped — fixed in this release.
  //
  // EncryptedLocalStorageDriver now wraps every value in a
  // `{data, expiresAt}` envelope before encrypting, matching the plain
  // driver shape so encrypted entries honor `expiresAfter`.
  //
  // File: src/drivers/EncryptedLocalStorageDriver.ts
  it("encrypted entries respect expiresAfter", () => {
    vi.useFakeTimers();
    try {
      driver.set("name", "Hasan", 1);
      vi.advanceTimersByTime(2 * 1000);
      expect(driver.get("name", "default")).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A cypher that cannot be decrypted must not break the driver.
 *
 * localStorage is writable by every script on the origin (and by hand
 * through DevTools / an extension), and a key rotation invalidates all
 * existing cyphers. Before the fix, one unreadable entry made every
 * `get()` on that key throw an uncaught error forever, because nothing
 * removed it — a persistent, self-inflicted denial of service.
 */
describe("EncryptedLocalStorageDriver — poisoned cyphers", () => {
  /** Strict decrypt: anything that is not a valid cypher throws. */
  function strictDecrypt(cypher: string): any {
    if (!cypher.startsWith("enc::")) {
      throw new Error("Malformed cypher");
    }

    return JSON.parse(Buffer.from(cypher.slice(5), "base64").toString("utf8"));
  }

  let driver: EncryptedLocalStorageDriver;

  beforeEach(() => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      encryption: { encrypt: fakeEncrypt, decrypt: strictDecrypt },
    });
    driver = new EncryptedLocalStorageDriver();
  });

  afterEach(() => {
    driver.clear();
  });

  it("get() returns the default value instead of throwing on a tampered entry", () => {
    driver.set("name", "Hasan");
    localStorage.setItem("name", "tampered-not-a-cypher");

    expect(() => driver.get("name")).not.toThrow();
    expect(driver.get("name", "default")).toBe("default");
  });

  it("get() evicts the poisoned entry so later reads are clean", () => {
    localStorage.setItem("name", "tampered-not-a-cypher");

    expect(driver.get("name", "default")).toBe("default");
    // Self-healed: the unreadable entry is gone from storage.
    expect(localStorage.getItem("name")).toBeNull();
    expect(driver.has("name")).toBe(false);
  });

  it("survives a cypher whose payload is not valid JSON", () => {
    // Correct envelope prefix, garbage body — the JSON.parse inside
    // decrypt throws.
    localStorage.setItem("name", "enc::" + Buffer.from("{not json").toString("base64"));

    expect(driver.get("name", "default")).toBe("default");
    expect(localStorage.getItem("name")).toBeNull();
  });

  it("evicts the poisoned entry under a configured prefix", () => {
    driver.setPrefixKey("enc-");
    localStorage.setItem("enc-name", "tampered");

    expect(driver.get("name", "default")).toBe("default");
    expect(localStorage.getItem("enc-name")).toBeNull();
  });

  it("a poisoned entry does not affect its neighbours", () => {
    driver.set("good", "value");
    localStorage.setItem("bad", "tampered");

    expect(driver.get("bad", "default")).toBe("default");
    expect(driver.get("good")).toBe("value");
  });

  it("a rotated key (decrypt now throws for old cyphers) heals on read", () => {
    driver.set("session", "token");
    // Rotate: the new decrypt rejects everything written before.
    setCacheConfigurations({
      encryption: {
        encrypt: fakeEncrypt,
        decrypt: () => {
          throw new Error("Wrong key");
        },
      },
    });

    expect(driver.get("session", null)).toBeNull();
    expect(localStorage.getItem("session")).toBeNull();
  });
});
