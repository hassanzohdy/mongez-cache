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

async function fakeEncrypt(value: any): Promise<string> {
  return "enc::" + Buffer.from(JSON.stringify(value)).toString("base64");
}

async function fakeDecrypt(cypher: string): Promise<any> {
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

  afterEach(async () => {
    await driver.clear();
  });

  it("writes to sessionStorage, not localStorage", async () => {
    await driver.set("name", "Hasan");
    expect(sessionStorage.getItem("name")).not.toBeNull();
    expect(localStorage.getItem("name")).toBeNull();
  });

  it("set / get round-trips with the configured async encrypt / decrypt", async () => {
    await driver.set("user", { id: 1, name: "Hasan" });
    // The driver wraps the value in a `{data, expiresAt}` envelope
    // before encrypting so that TTL works the same way as in the
    // plain drivers.
    expect(encrypt).toHaveBeenCalledWith({
      data: { id: 1, name: "Hasan" },
      expiresAt: undefined,
    });
    expect(await driver.get("user")).toEqual({ id: 1, name: "Hasan" });
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("stores the cypher on disk, not the plain value", async () => {
    await driver.set("name", "Hasan");
    expect(sessionStorage.getItem("name")).toMatch(/^enc::/);
  });

  it("remove() drops the key", async () => {
    await driver.set("name", "Hasan");
    await driver.remove("name");
    expect(await driver.has("name")).toBe(false);
  });

  it("respects a configured prefix", async () => {
    driver.setPrefixKey("sess-");
    await driver.set("name", "Hasan");
    expect(sessionStorage.getItem("sess-name")).not.toBeNull();
    expect(await driver.get("name")).toBe("Hasan");
  });
});
