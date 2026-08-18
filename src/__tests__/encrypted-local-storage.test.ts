/**
 * EncryptedLocalStorageDriver tests.
 *
 * The encrypted driver overrides `set` / `get` / `remove` to route
 * values through the encrypt/decrypt functions configured via
 * `setCacheConfigurations({ encryption: { encrypt, decrypt } })`. We
 * stub those with reversible transforms so the assertions can verify
 * that an encrypt happens on `set` and a decrypt happens on `get`.
 *
 * Both hooks are exercised in their async form here, because that is
 * what @mongez/encryption 2.x returns (WebCrypto AES-GCM cannot be
 * synchronous). A separate block covers the synchronous 1.x shape,
 * which the driver still accepts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCacheConfigurations } from "../config";
import EncryptedLocalStorageDriver from "../drivers/EncryptedLocalStorageDriver";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";

/** Reversible "encryption" — just a base64 round-trip wrapped around JSON. */
function encodeCypher(value: any): string {
  return "enc::" + Buffer.from(JSON.stringify(value)).toString("base64");
}

function decodeCypher(cypher: string): any {
  if (!cypher.startsWith("enc::")) return null;
  return JSON.parse(Buffer.from(cypher.slice(5), "base64").toString("utf8"));
}

/** The async shape — what @mongez/encryption 2.x hands back. */
async function fakeEncrypt(value: any): Promise<string> {
  return encodeCypher(value);
}

async function fakeDecrypt(cypher: string): Promise<any> {
  return decodeCypher(cypher);
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

  afterEach(async () => {
    await driver.clear();
  });

  it("set() calls encrypt before writing", async () => {
    await driver.set("name", "Hasan");
    // The driver wraps the value in a `{data, expiresAt}` envelope
    // before encrypting so that TTL works the same way as in the
    // plain drivers.
    expect(encrypt).toHaveBeenCalledWith({
      data: "Hasan",
      expiresAt: undefined,
    });
    expect(encrypt).toHaveBeenCalledTimes(1);
  });

  it("set() awaits an async encrypt — the cypher, not a promise, hits the disk", async () => {
    await driver.set("name", "Hasan");
    const rawDisk = localStorage.getItem("name");
    expect(typeof rawDisk).toBe("string");
    expect(rawDisk).toMatch(/^enc::/);
    expect(rawDisk).not.toContain("[object Promise]");
  });

  it("get() calls decrypt and returns the original value", async () => {
    await driver.set("name", "Hasan");
    expect(await driver.get("name")).toBe("Hasan");
    expect(decrypt).toHaveBeenCalledTimes(1);
  });

  it("set / get round-trips strings, numbers, arrays, and objects", async () => {
    await driver.set("s", "Hasan");
    await driver.set("n", 42);
    await driver.set("a", [1, 2, 3]);
    await driver.set("o", { id: 1, name: "Hasan" });

    expect(await driver.get("s")).toBe("Hasan");
    expect(await driver.get("n")).toBe(42);
    expect(await driver.get("a")).toEqual([1, 2, 3]);
    expect(await driver.get("o")).toEqual({ id: 1, name: "Hasan" });
  });

  it("get() returns the on-disk value through decrypt, not the raw cypher", async () => {
    await driver.set("name", "Hasan");
    const rawDisk = localStorage.getItem("name");
    // The disk holds the cypher, not the plain value.
    expect(rawDisk).not.toBe("Hasan");
    expect(rawDisk).toMatch(/^enc::/);
  });

  it("get() returns the default value when the key is missing", async () => {
    expect(await driver.get("ghost", "fallback")).toBe("fallback");
  });

  it("get() returns null when the key is missing and no default is given", async () => {
    expect(await driver.get("ghost")).toBeNull();
  });

  it("remove() drops the key from storage", async () => {
    await driver.set("name", "Hasan");
    await driver.remove("name");
    expect(await driver.has("name")).toBe(false);
    expect(await driver.get("name", null)).toBeNull();
  });

  it("set() resolves with the driver for chaining", async () => {
    expect(await driver.set("a", 1)).toBe(driver);
  });

  it("remove() resolves with the driver for chaining", async () => {
    await driver.set("a", 1);
    expect(await driver.remove("a")).toBe(driver);
  });

  it("overwriting a key updates the stored cypher", async () => {
    await driver.set("name", "Hasan");
    const firstCypher = localStorage.getItem("name");
    await driver.set("name", "Ali");
    const secondCypher = localStorage.getItem("name");
    expect(firstCypher).not.toBe(secondCypher);
    expect(await driver.get("name")).toBe("Ali");
  });

  it("clear() wipes all keys", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    await driver.clear();
    expect(await driver.has("a")).toBe(false);
    expect(await driver.has("b")).toBe(false);
  });

  it("respects a configured prefix on every operation", async () => {
    driver.setPrefixKey("enc-");
    await driver.set("name", "Hasan");
    // On-disk key carries the prefix.
    expect(localStorage.getItem("enc-name")).not.toBeNull();
    expect(await driver.get("name")).toBe("Hasan");
    await driver.remove("name");
    expect(await driver.has("name")).toBe(false);
  });

  // Previously skipped — fixed in 1.4.0.
  //
  // EncryptedLocalStorageDriver wraps every value in a
  // `{data, expiresAt}` envelope before encrypting, matching the plain
  // driver shape so encrypted entries honor `expiresAfter`.
  //
  // File: src/drivers/EncryptedLocalStorageDriver.ts
  it("encrypted entries respect expiresAfter", async () => {
    vi.useFakeTimers();
    try {
      await driver.set("name", "Hasan", 1);
      vi.advanceTimersByTime(2 * 1000);
      expect(await driver.get("name", "default")).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A synchronous encrypt/decrypt pair (the @mongez/encryption 1.x shape)
 * must keep working: the driver awaits whatever the hooks return, and
 * `await` on a non-promise is a no-op.
 */
describe("EncryptedLocalStorageDriver — synchronous encryption hooks", () => {
  let driver: EncryptedLocalStorageDriver;

  beforeEach(() => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      encryption: { encrypt: encodeCypher, decrypt: decodeCypher },
    });
    driver = new EncryptedLocalStorageDriver();
  });

  afterEach(async () => {
    await driver.clear();
  });

  it("round-trips a value through sync hooks", async () => {
    await driver.set("name", "Hasan");
    expect(localStorage.getItem("name")).toMatch(/^enc::/);
    expect(await driver.get("name")).toBe("Hasan");
  });

  it("still honors expiresAfter", async () => {
    vi.useFakeTimers();
    try {
      await driver.set("name", "Hasan", 1);
      vi.advanceTimersByTime(2 * 1000);
      expect(await driver.get("name", "default")).toBe("default");
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
 *
 * With an authenticated cipher (AES-GCM in @mongez/encryption 2.x) the
 * rejected-tag case lands on the same path, so this is also the tamper
 * response: a modified entry is evicted, never returned as data.
 */
describe("EncryptedLocalStorageDriver — poisoned cyphers", () => {
  /** Strict decrypt: anything that is not a valid cypher rejects. */
  async function strictDecrypt(cypher: string): Promise<any> {
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

  afterEach(async () => {
    await driver.clear();
  });

  it("get() returns the default value instead of rejecting on a tampered entry", async () => {
    await driver.set("name", "Hasan");
    localStorage.setItem("name", "tampered-not-a-cypher");

    await expect(driver.get("name")).resolves.not.toThrow();
    expect(await driver.get("name", "default")).toBe("default");
  });

  it("get() evicts the poisoned entry so later reads are clean", async () => {
    localStorage.setItem("name", "tampered-not-a-cypher");

    expect(await driver.get("name", "default")).toBe("default");
    // Self-healed: the unreadable entry is gone from storage.
    expect(localStorage.getItem("name")).toBeNull();
    expect(await driver.has("name")).toBe(false);
  });

  it("survives a cypher whose payload is not valid JSON", async () => {
    // Correct envelope prefix, garbage body — the JSON.parse inside
    // decrypt throws.
    localStorage.setItem(
      "name",
      "enc::" + Buffer.from("{not json").toString("base64")
    );

    expect(await driver.get("name", "default")).toBe("default");
    expect(localStorage.getItem("name")).toBeNull();
  });

  it("evicts the poisoned entry under a configured prefix", async () => {
    driver.setPrefixKey("enc-");
    localStorage.setItem("enc-name", "tampered");

    expect(await driver.get("name", "default")).toBe("default");
    expect(localStorage.getItem("enc-name")).toBeNull();
  });

  it("a poisoned entry does not affect its neighbours", async () => {
    await driver.set("good", "value");
    localStorage.setItem("bad", "tampered");

    expect(await driver.get("bad", "default")).toBe("default");
    expect(await driver.get("good")).toBe("value");
  });

  it("a rotated key (decrypt now rejects old cyphers) heals on read", async () => {
    await driver.set("session", "token");
    // Rotate: the new decrypt rejects everything written before.
    setCacheConfigurations({
      encryption: {
        encrypt: fakeEncrypt,
        decrypt: async () => {
          throw new Error("Wrong key");
        },
      },
    });

    expect(await driver.get("session", null)).toBeNull();
    expect(localStorage.getItem("session")).toBeNull();
  });
});
