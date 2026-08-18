/**
 * CacheManager tests.
 *
 * CacheManager is a thin facade — it forwards every method to the
 * underlying driver. The tests below verify the forwarding contract
 * and the driver-swap path. Since 2.0.0 every storage method returns a
 * promise, so the facade is awaited exactly like a driver.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheManager } from "../CacheManager";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";
import PlainSessionStorageDriver from "../drivers/PlainSessionStorageDriver";
import RunTimeDriver from "../drivers/RunTimeDriver";

describe("CacheManager", () => {
  let manager: CacheManager;
  let driver: PlainLocalStorageDriver;

  beforeEach(() => {
    manager = new CacheManager();
    driver = new PlainLocalStorageDriver();
    manager.setDriver(driver);
  });

  afterEach(async () => {
    await driver.clear();
  });

  it("setDriver / getDriver round-trips", () => {
    expect(manager.getDriver()).toBe(driver);
    const other = new RunTimeDriver();
    manager.setDriver(other);
    expect(manager.getDriver()).toBe(other);
  });

  it("set() forwards to the driver", async () => {
    await manager.set("name", "Hasan");
    expect(await driver.get("name")).toBe("Hasan");
  });

  it("get() forwards to the driver", async () => {
    await driver.set("name", "Hasan");
    expect(await manager.get("name")).toBe("Hasan");
  });

  it("every storage method returns a promise", () => {
    expect(manager.set("name", "Hasan")).toBeInstanceOf(Promise);
    expect(manager.get("name")).toBeInstanceOf(Promise);
    expect(manager.has("name")).toBeInstanceOf(Promise);
    expect(manager.keys()).toBeInstanceOf(Promise);
    expect(manager.getAll()).toBeInstanceOf(Promise);
    expect(manager.remove("name")).toBeInstanceOf(Promise);
    expect(manager.clear()).toBeInstanceOf(Promise);
  });

  it("get() returns null when key is missing and no default is given", async () => {
    expect(await manager.get("ghost")).toBeNull();
  });

  it("get() returns the supplied default when the key is missing", async () => {
    expect(await manager.get("ghost", "fallback")).toBe("fallback");
  });

  it("has() forwards to the driver", async () => {
    await manager.set("name", "Hasan");
    expect(await manager.has("name")).toBe(true);
    await manager.remove("name");
    expect(await manager.has("name")).toBe(false);
  });

  it("remove() forwards to the driver", async () => {
    await manager.set("name", "Hasan");
    await manager.remove("name");
    expect(await driver.has("name")).toBe(false);
  });

  it("keys() forwards to the driver", async () => {
    await manager.set("a", 1);
    await manager.set("b", 2);
    expect((await manager.keys()).sort()).toEqual(["a", "b"]);
  });

  it("getAll() forwards to the driver and returns every live entry", async () => {
    await manager.set("a", 1);
    await manager.set("b", 2);
    expect(await manager.getAll()).toEqual({ a: 1, b: 2 });
  });

  it("getAll() excludes expired entries", async () => {
    await manager.set("live", 1);
    await manager.set("dead", 2, -1);
    expect(await manager.getAll()).toEqual({ live: 1 });
  });

  it("setPrefixKey() / getPrefixKey() forward to the driver", async () => {
    manager.setPrefixKey("app-");
    expect(manager.getPrefixKey()).toBe("app-");
    expect(driver.getPrefixKey()).toBe("app-");
    await manager.set("name", "Hasan");
    expect(localStorage.getItem("app-name")).not.toBeNull();
    await manager.remove("name");
  });

  it("clear() forwards to the driver and resolves with the manager for chaining", async () => {
    await manager.set("a", 1);
    await manager.set("b", 2);
    const result = await manager.clear();
    expect(await driver.has("a")).toBe(false);
    expect(await driver.has("b")).toBe(false);
    expect(result).toBe(manager);
  });

  it("setValueParser() / setValueConverter() forward to the driver", async () => {
    const customConverter = (v: any) => "::" + JSON.stringify(v);
    const customParser = (v: any) => JSON.parse(v.slice(2));
    manager.setValueConverter(customConverter);
    manager.setValueParser(customParser);
    await manager.set("name", "Hasan");
    expect(localStorage.getItem("name")!.startsWith("::")).toBe(true);
    expect(await manager.get("name")).toBe("Hasan");
    await manager.clear();
  });

  it("set() supports an expiry parameter that propagates to the driver", async () => {
    const rt = new RunTimeDriver();
    manager.setDriver(rt);
    await manager.set("name", "Hasan", 60);
    expect(await rt.get("name")).toBe("Hasan");
  });

  it("a single manager can be retargeted at a different storage backend", async () => {
    // Start with local, switch to session, and verify writes land in
    // the new backend, not the previous one.
    await manager.set("name", "Hasan");
    expect(localStorage.getItem("name")).not.toBeNull();
    await manager.remove("name");

    const sessionDriver = new PlainSessionStorageDriver();
    manager.setDriver(sessionDriver);
    await manager.set("name", "Ali");
    expect(sessionStorage.getItem("name")).not.toBeNull();
    expect(localStorage.getItem("name")).toBeNull();
    await sessionDriver.clear();
  });

  it("chainable mutators resolve with / return the manager", async () => {
    // `set` resolves with the manager; `setPrefixKey` is synchronous
    // and returns it directly.
    expect(await manager.set("a", 1)).toBe(manager);
    expect(manager.setPrefixKey("p-")).toBe(manager);
    await manager.remove("a");
  });
});
