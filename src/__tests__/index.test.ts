/**
 * Public-export surface tests.
 *
 * Catches accidental rename / removal of any exported name. Every
 * named import below MUST resolve to a value or a type alias at
 * compile time.
 */
import { describe, expect, it } from "vitest";
import cache, {
  BaseCacheEngine,
  CacheManager,
  CacheQuotaExceededError,
  DEFAULT_INDEXED_DB_NAME,
  DEFAULT_INDEXED_DB_STORE,
  DEFAULT_INDEXED_DB_VERSION,
  EncryptedIndexedDBDriver,
  EncryptedLocalStorageDriver,
  EncryptedSessionStorageDriver,
  IndexedDBBlockedError,
  IndexedDBDriver,
  IndexedDBUnavailableError,
  PlainLocalStorageDriver,
  PlainSessionStorageDriver,
  RunTimeDriver,
  getCacheConfig,
  getCacheConfigurations,
  setCacheConfigurations,
} from "../index";
import type {
  CacheConfigurations,
  CacheDriverInterface,
  CacheEncryptionConfigurations,
  CacheManagerInterface,
  IndexedDBCacheRecord,
  IndexedDBDriverOptions,
} from "../index";

describe("public exports", () => {
  it("default export is a CacheManager instance", () => {
    expect(cache).toBeDefined();
    expect(typeof cache.set).toBe("function");
    expect(typeof cache.get).toBe("function");
    expect(typeof cache.has).toBe("function");
    expect(typeof cache.remove).toBe("function");
    expect(typeof cache.keys).toBe("function");
    expect(typeof cache.clear).toBe("function");
    expect(typeof cache.setDriver).toBe("function");
    expect(typeof cache.getDriver).toBe("function");
  });

  it("named exports — classes", () => {
    expect(typeof CacheManager).toBe("function");
    expect(typeof BaseCacheEngine).toBe("function");
    expect(typeof PlainLocalStorageDriver).toBe("function");
    expect(typeof PlainSessionStorageDriver).toBe("function");
    expect(typeof EncryptedLocalStorageDriver).toBe("function");
    expect(typeof EncryptedSessionStorageDriver).toBe("function");
    expect(typeof IndexedDBDriver).toBe("function");
    expect(typeof EncryptedIndexedDBDriver).toBe("function");
    expect(typeof RunTimeDriver).toBe("function");
  });

  it("named exports — errors", () => {
    expect(typeof IndexedDBUnavailableError).toBe("function");
    expect(typeof IndexedDBBlockedError).toBe("function");
    expect(typeof CacheQuotaExceededError).toBe("function");
  });

  it("named exports — IndexedDB defaults", () => {
    expect(DEFAULT_INDEXED_DB_NAME).toBe("mongez-cache");
    expect(DEFAULT_INDEXED_DB_STORE).toBe("cache");
    expect(DEFAULT_INDEXED_DB_VERSION).toBe(1);
  });

  it("named exports — configuration helpers", () => {
    expect(typeof setCacheConfigurations).toBe("function");
    expect(typeof getCacheConfigurations).toBe("function");
    expect(typeof getCacheConfig).toBe("function");
  });

  it("types compile — driver, manager, configuration, IndexedDB options", () => {
    // Type-only assertions — they exist if this file compiles.
    const driverShape: CacheDriverInterface = new PlainLocalStorageDriver();
    const managerShape: CacheManagerInterface = new CacheManager();
    const encryptionShape: CacheEncryptionConfigurations = {
      encrypt: async value => JSON.stringify(value),
      decrypt: async value => JSON.parse(value),
    };
    const configShape: CacheConfigurations = {
      driver: driverShape,
      encryption: encryptionShape,
    };
    const indexedDBOptions: IndexedDBDriverOptions = {
      databaseName: "app-cache",
      storeName: "entries",
      version: 2,
    };
    const record: IndexedDBCacheRecord = { value: 1, expiresAt: undefined };

    expect(driverShape).toBeDefined();
    expect(managerShape).toBeDefined();
    expect(configShape.driver).toBe(driverShape);
    expect(indexedDBOptions.version).toBe(2);
    expect(record.value).toBe(1);
  });

  it("the default cache instance is a CacheManager", () => {
    expect(cache instanceof CacheManager).toBe(true);
  });

  it("PlainLocalStorageDriver extends BaseCacheEngine", () => {
    expect(new PlainLocalStorageDriver() instanceof BaseCacheEngine).toBe(true);
  });

  it("EncryptedLocalStorageDriver extends PlainLocalStorageDriver", () => {
    expect(
      new EncryptedLocalStorageDriver() instanceof PlainLocalStorageDriver,
    ).toBe(true);
  });

  it("EncryptedSessionStorageDriver extends EncryptedLocalStorageDriver", () => {
    expect(
      new EncryptedSessionStorageDriver() instanceof EncryptedLocalStorageDriver,
    ).toBe(true);
  });

  it("EncryptedIndexedDBDriver extends IndexedDBDriver", () => {
    expect(new EncryptedIndexedDBDriver() instanceof IndexedDBDriver).toBe(true);
  });

  it("RunTimeDriver extends BaseCacheEngine", () => {
    expect(new RunTimeDriver() instanceof BaseCacheEngine).toBe(true);
  });

  it("constructing the IndexedDB driver does not touch `indexedDB`", () => {
    // No database is opened until the first operation, so importing or
    // constructing the driver is safe in a server-rendered bundle.
    expect(() => new IndexedDBDriver()).not.toThrow();
  });
});
