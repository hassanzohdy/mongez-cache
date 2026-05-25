/**
 * EncryptedSessionStorageDriver tests.
 *
 * Extends EncryptedLocalStorageDriver and swaps the storage to
 * `sessionStorage`. We verify the routing and the encrypt/decrypt
 * round-trip; the exhaustive set/get/remove matrix lives in
 * `encrypted-local-storage.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCacheConfigurations } from "../config";
import EncryptedSessionStorageDriver from "../drivers/EncryptedSessionStorageDriver";
import PlainSessionStorageDriver from "../drivers/PlainSessionStorageDriver";

function fakeEncrypt(value: any): string {
  return "enc::" + Buffer.from(JSON.stringify(value)).toString("base64");
}

function fakeDecrypt(cypher: string): any {
  if (typeof cypher !== "string" || !cypher.startsWith("enc::")) return null;
  return JSON.parse(Buffer.from(cypher.slice(5), "base64").toString("utf8"));
}

describe("EncryptedSessionStorageDriver", () => {
  let driver: EncryptedSessionStorageDriver;
  const encrypt = vi.fn(fakeEncrypt);
  const decrypt = vi.fn(fakeDecrypt);

  beforeEach(() => {
    encrypt.mockClear();
    decrypt.mockClear();
    setCacheConfigurations({
      driver: new PlainSessionStorageDriver(),
      encryption: { encrypt, decrypt },
    });
    driver = new EncryptedSessionStorageDriver();
  });

  afterEach(() => {
    driver.clear();
  });

  it("writes to sessionStorage, not localStorage", () => {
    driver.set("name", "Hasan");
    expect(sessionStorage.getItem("name")).not.toBeNull();
    expect(localStorage.getItem("name")).toBeNull();
  });

  it("set / get round-trips with the configured encrypt / decrypt", () => {
    driver.set("user", { id: 1, name: "Hasan" });
    // The driver wraps the value in a `{data, expiresAt}` envelope
    // before encrypting so that TTL works the same way as in the
    // plain drivers.
    expect(encrypt).toHaveBeenCalledWith({
      data: { id: 1, name: "Hasan" },
      expiresAt: undefined,
    });
    expect(driver.get("user")).toEqual({ id: 1, name: "Hasan" });
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("stores the cypher on disk, not the plain value", () => {
    driver.set("name", "Hasan");
    expect(sessionStorage.getItem("name")).toMatch(/^enc::/);
  });

  it("remove() drops the key", () => {
    driver.set("name", "Hasan");
    driver.remove("name");
    expect(driver.has("name")).toBe(false);
  });

  it("respects a configured prefix", () => {
    driver.setPrefixKey("sess-");
    driver.set("name", "Hasan");
    expect(sessionStorage.getItem("sess-name")).not.toBeNull();
    expect(driver.get("name")).toBe("Hasan");
  });
});
