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
  EncryptedLocalStorageDriver,
  EncryptedSessionStorageDriver,
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
  CacheManagerInterface,
} from "../index";

describe("public exports", () => {
  it("default export is a CacheManager instance", () => {
    expect(cache).toBeDefined();
    expect(typeof cache.set).toBe("function");
    expect(typeof cache.get).toBe("function");
    expect(typeof cache.has).toBe("function");
    expect(typeof cache.remove).toBe("function");
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
    expect(typeof RunTimeDriver).toBe("function");
  });

  it("named exports — configuration helpers", () => {
    expect(typeof setCacheConfigurations).toBe("function");
    expect(typeof getCacheConfigurations).toBe("function");
    expect(typeof getCacheConfig).toBe("function");
  });

  it("types compile — CacheDriverInterface, CacheManagerInterface, CacheConfigurations", () => {
    // Type-only assertions — they exist if this file compiles.
    const driverShape: CacheDriverInterface = new PlainLocalStorageDriver();
    const managerShape: CacheManagerInterface = new CacheManager();
    const configShape: CacheConfigurations = {
      driver: driverShape,
    };
    expect(driverShape).toBeDefined();
    expect(managerShape).toBeDefined();
    expect(configShape.driver).toBe(driverShape);
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

  it("RunTimeDriver extends BaseCacheEngine", () => {
    expect(new RunTimeDriver() instanceof BaseCacheEngine).toBe(true);
  });
});
