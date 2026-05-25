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
