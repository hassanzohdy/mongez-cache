/**
 * CacheManager tests.
 *
 * CacheManager is a thin facade — it forwards every method to the
 * underlying driver. The tests below verify the forwarding contract
 * and the driver-swap path.
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

  afterEach(() => {
    driver.clear();
  });

  it("setDriver / getDriver round-trips", () => {
    expect(manager.getDriver()).toBe(driver);
    const other = new RunTimeDriver();
    manager.setDriver(other);
    expect(manager.getDriver()).toBe(other);
  });

  it("set() forwards to the driver", () => {
    manager.set("name", "Hasan");
    expect(driver.get("name")).toBe("Hasan");
  });

  it("get() forwards to the driver", () => {
    driver.set("name", "Hasan");
    expect(manager.get("name")).toBe("Hasan");
  });

  it("get() returns null when key is missing and no default is given", () => {
    expect(manager.get("ghost")).toBeNull();
  });

  it("get() returns the supplied default when the key is missing", () => {
    expect(manager.get("ghost", "fallback")).toBe("fallback");
  });

  it("has() forwards to the driver", () => {
    manager.set("name", "Hasan");
    expect(manager.has("name")).toBe(true);
    manager.remove("name");
    expect(manager.has("name")).toBe(false);
  });

  it("remove() forwards to the driver", () => {
    manager.set("name", "Hasan");
    manager.remove("name");
    expect(driver.has("name")).toBe(false);
  });

  it("setPrefixKey() / getPrefixKey() forward to the driver", () => {
    manager.setPrefixKey("app-");
    expect(manager.getPrefixKey()).toBe("app-");
    expect(driver.getPrefixKey()).toBe("app-");
    manager.set("name", "Hasan");
    expect(localStorage.getItem("app-name")).not.toBeNull();
    manager.remove("name");
  });

  it("clear() forwards to the driver and returns the manager for chaining", () => {
    manager.set("a", 1);
    manager.set("b", 2);
    const result = manager.clear();
    expect(driver.has("a")).toBe(false);
    expect(driver.has("b")).toBe(false);
    expect(result).toBe(manager);
  });

  it("setValueParser() / setValueConverter() forward to the driver", () => {
    const customConverter = (v: any) => "::" + JSON.stringify(v);
    const customParser = (v: any) => JSON.parse(v.slice(2));
    manager.setValueConverter(customConverter);
    manager.setValueParser(customParser);
    manager.set("name", "Hasan");
    expect(localStorage.getItem("name")!.startsWith("::")).toBe(true);
    expect(manager.get("name")).toBe("Hasan");
    manager.clear();
  });

  it("set() supports an expiry parameter that propagates to the driver", () => {
    const rt = new RunTimeDriver();
    manager.setDriver(rt);
    manager.set("name", "Hasan", 60);
    expect(rt.get("name")).toBe("Hasan");
  });

  it("a single manager can be retargeted at a different storage backend", () => {
    // Start with local, switch to session, and verify writes land in
    // the new backend, not the previous one.
    manager.set("name", "Hasan");
    expect(localStorage.getItem("name")).not.toBeNull();
    manager.remove("name");

    const sessionDriver = new PlainSessionStorageDriver();
    manager.setDriver(sessionDriver);
    manager.set("name", "Ali");
    expect(sessionStorage.getItem("name")).not.toBeNull();
    expect(localStorage.getItem("name")).toBeNull();
    sessionDriver.clear();
  });

  it("chainable mutators return the manager", () => {
    // The signatures declare `: CacheDriverInterface` for these but
    // the implementation returns `this`, so chaining works at
    // runtime. Document the actual behavior.
    expect(manager.set("a", 1)).toBe(manager);
    expect(manager.setPrefixKey("p-")).toBe(manager);
    manager.remove("a");
  });
});
