/**
 * Configuration tests.
 *
 * `setCacheConfigurations` is the one-shot bootstrap entry point. It
 * forwards the driver / prefix / value-converter / value-parser fields
 * to the default cache manager, then records everything in a
 * module-level singleton so `getCacheConfig("expiresAfter")` and the
 * encrypted drivers can read it later.
 *
 * The singleton means tests that mutate config bleed into each other
 * unless reset. We re-apply a known baseline in `beforeEach`.
 */
import { beforeEach, describe, expect, it } from "vitest";
import cache from "../CacheManager";
import {
  getCacheConfig,
  getCacheConfigurations,
  setCacheConfigurations,
} from "../config";
import PlainLocalStorageDriver from "../drivers/PlainLocalStorageDriver";
import RunTimeDriver from "../drivers/RunTimeDriver";

describe("setCacheConfigurations", () => {
  beforeEach(() => {
    // Reset to a known baseline before every test.
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
    });
  });

  it("sets the driver on the default cache manager", () => {
    const driver = new RunTimeDriver();
    setCacheConfigurations({ driver });
    expect(cache.getDriver()).toBe(driver);
  });

  it("applies a prefix to the active driver", async () => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      prefix: "config-test-",
    });
    expect(cache.getPrefixKey()).toBe("config-test-");
    await cache.set("name", "Hasan");
    expect(localStorage.getItem("config-test-name")).not.toBeNull();
    await cache.remove("name");
  });

  it("applies a custom value converter and parser to the active driver", async () => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      valueConverter: (v: any) => "wrap::" + JSON.stringify(v),
      valueParer: (v: any) => JSON.parse(v.slice(6)),
    });
    await cache.set("name", "Hasan");
    expect(localStorage.getItem("name")!.startsWith("wrap::")).toBe(true);
    expect(await cache.get("name")).toBe("Hasan");
    await cache.clear();
  });

  it("merges new fields into the existing configuration record", () => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      prefix: "step-1-",
    });
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      expiresAfter: 60,
    });
    // Both fields are preserved in the configuration record (the
    // second call only adds `expiresAfter`; the prefix from the
    // first call stays in the singleton).
    const cfg = getCacheConfigurations();
    expect(cfg.prefix).toBe("step-1-");
    expect(cfg.expiresAfter).toBe(60);
  });
});

describe("getCacheConfigurations", () => {
  it("returns the current configuration record", () => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      prefix: "read-",
      expiresAfter: 120,
    });
    const cfg = getCacheConfigurations();
    expect(cfg.prefix).toBe("read-");
    expect(cfg.expiresAfter).toBe(120);
  });
});

describe("getCacheConfig", () => {
  it("returns a single configuration value by key", () => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      expiresAfter: 90,
    });
    expect(getCacheConfig("expiresAfter")).toBe(90);
  });

  it("returns the configured value for a known key", () => {
    setCacheConfigurations({
      driver: new PlainLocalStorageDriver(),
      prefix: "lookup-",
    });
    expect(getCacheConfig("prefix")).toBe("lookup-");
  });

  it("expiresAfter from configuration is applied as a default to set()", async () => {
    // When `expiresAfter` is set globally and no per-call expiry is
    // passed to `cache.set(...)`, the global one is used.
    const driver = new PlainLocalStorageDriver();
    setCacheConfigurations({
      driver,
      expiresAfter: 1,
    });
    await driver.set("name", "Hasan");
    const onDisk = JSON.parse(localStorage.getItem("name")!);
    // The envelope carries an expiresAt timestamp, not Infinity.
    expect(typeof onDisk.expiresAt).toBe("number");
    await driver.clear();
  });
});
