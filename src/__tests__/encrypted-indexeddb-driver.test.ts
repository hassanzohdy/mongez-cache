/**
 * EncryptedIndexedDBDriver tests.
 *
 * The encrypted IndexedDB driver encrypts the whole `{data, expiresAt}`
 * envelope, exactly like the encrypted Web Storage drivers, and keeps a
 * plaintext copy of `expiresAt` on the record so expired rows can be
 * evicted without decrypting them.
 *
 * The encrypt/decrypt hooks here are async — the shape
 * @mongez/encryption 2.x (WebCrypto AES-GCM) hands back.
 */
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCacheConfigurations } from "../config";
import EncryptedIndexedDBDriver from "../drivers/EncryptedIndexedDBDriver";
import IndexedDBDriver from "../drivers/IndexedDBDriver";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";

const DATABASE_NAME = "mongez-cache-encrypted-test";

async function fakeEncrypt(value: any): Promise<string> {
  return "enc::" + Buffer.from(JSON.stringify(value)).toString("base64");
}

/** Strict decrypt: anything that is not a valid cypher rejects. */
async function fakeDecrypt(cypher: string): Promise<any> {
  if (typeof cypher !== "string" || !cypher.startsWith("enc::")) {
    throw new Error("Malformed cypher");
  }

  return JSON.parse(Buffer.from(cypher.slice(5), "base64").toString("utf8"));
}

describe("EncryptedIndexedDBDriver", () => {
  let driver: EncryptedIndexedDBDriver;
  const encrypt = vi.fn(fakeEncrypt);
  const decrypt = vi.fn(fakeDecrypt);

  beforeEach(() => {
    encrypt.mockClear();
    decrypt.mockClear();
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      encryption: { encrypt, decrypt },
    });
    driver = new EncryptedIndexedDBDriver({ databaseName: DATABASE_NAME });
  });

  afterEach(async () => {
    await driver.clear();
    await driver.close();
  });

  it("set() awaits the async encrypt and stores the cypher, not a promise", async () => {
    await driver.set("name", "Hasan");

    // Read the raw record through a plain driver pointed at the same
    // store: what landed on disk must be the cypher string.
    const raw = new IndexedDBDriver({ databaseName: DATABASE_NAME });
    const stored = await raw.get("name");

    expect(typeof stored).toBe("string");
    expect(stored).toMatch(/^enc::/);
    expect(stored).not.toContain("Hasan");

    await raw.close();
  });

  it("set / get round-trips through async encryption", async () => {
    await driver.set("user", { id: 1, name: "Hasan" });

    expect(encrypt).toHaveBeenCalledWith({
      data: { id: 1, name: "Hasan" },
      expiresAt: undefined,
    });
    expect(await driver.get("user")).toEqual({ id: 1, name: "Hasan" });
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("get() returns the default value when the key is missing", async () => {
    expect(await driver.get("ghost", "fallback")).toBe("fallback");
  });

  it("honors expiresAfter", async () => {
    await driver.set("name", "Hasan", -1);

    expect(await driver.get("name", "default")).toBe("default");
    expect(await driver.keys()).toEqual([]);
  });

  it("getAll() decrypts every live entry", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);

    expect(await driver.getAll()).toEqual({ a: 1, b: 2 });
  });

  it("keys() works without decrypting anything", async () => {
    await driver.set("a", 1);
    decrypt.mockClear();

    expect(await driver.keys()).toEqual(["a"]);
    expect(decrypt).not.toHaveBeenCalled();
  });
});

/**
 * A record whose cypher cannot be decrypted — tampered by another
 * script on the origin, or orphaned by a key rotation — must not make
 * every later read reject. It is evicted and the default is returned,
 * the same self-healing behavior the encrypted Web Storage drivers
 * implement. With AES-GCM the failed authentication tag arrives here
 * too, so eviction is also the tamper response.
 */
describe("EncryptedIndexedDBDriver — tampered records", () => {
  let driver: EncryptedIndexedDBDriver;
  let raw: IndexedDBDriver;

  beforeEach(() => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      encryption: { encrypt: fakeEncrypt, decrypt: fakeDecrypt },
    });
    driver = new EncryptedIndexedDBDriver({ databaseName: DATABASE_NAME });
    raw = new IndexedDBDriver({ databaseName: DATABASE_NAME });
  });

  afterEach(async () => {
    await driver.clear();
    await driver.close();
    await raw.close();
  });

  it("get() returns the default instead of rejecting on a tampered record", async () => {
    await driver.set("name", "Hasan");
    // Overwrite the cypher with garbage, the way a hostile script
    // sharing the origin would.
    await raw.set("name", "tampered-not-a-cypher");

    await expect(driver.get("name", "default")).resolves.toBe("default");
  });

  it("the poisoned record is evicted, so later reads are clean", async () => {
    await raw.set("name", "tampered-not-a-cypher");

    expect(await driver.get("name", "default")).toBe("default");
    expect(await driver.has("name")).toBe(false);
    expect(await driver.keys()).toEqual([]);
  });

  it("a poisoned record does not affect its neighbours", async () => {
    await driver.set("good", "value");
    await raw.set("bad", "tampered");

    expect(await driver.get("bad", "default")).toBe("default");
    expect(await driver.get("good")).toBe("value");
  });

  it("a rotated key heals on read", async () => {
    await driver.set("session", "token");

    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      encryption: {
        encrypt: fakeEncrypt,
        decrypt: async () => {
          throw new Error("Wrong key");
        },
      },
    });

    expect(await driver.get("session", null)).toBeNull();
    expect(await driver.keys()).toEqual([]);
  });

  it("an attacker cannot extend a TTL by editing the plaintext expiresAt", async () => {
    // The authenticated copy of `expiresAt` lives inside the cypher, so
    // pushing the plaintext one into the future buys nothing: the inner
    // check still expires the entry.
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      encryption: { encrypt: fakeEncrypt, decrypt: fakeDecrypt },
    });

    const cypher = await fakeEncrypt({
      data: "secret",
      expiresAt: new Date().getTime() - 1000,
    });

    // `raw.set` writes `{ value: cypher, expiresAt: undefined }` — the
    // plaintext expiry is gone, i.e. "never expires".
    await raw.set("session", cypher);

    expect(await driver.get("session", "default")).toBe("default");
  });
});
