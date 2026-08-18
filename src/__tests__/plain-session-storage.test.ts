/**
 * PlainSessionStorageDriver tests.
 *
 * The session driver shares the BaseCacheEngine implementation with
 * the local-storage one; the only difference is that
 * `storage = sessionStorage`. We re-cover the contract here so a
 * regression in either backend is caught individually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlainSessionStorageDriver from "../drivers/PlainSessionStorageDriver";

describe("PlainSessionStorageDriver", () => {
  let driver: PlainSessionStorageDriver;

  beforeEach(() => {
    driver = new PlainSessionStorageDriver();
  });

  afterEach(async () => {
    await driver.clear();
  });

  it("uses sessionStorage, not localStorage", async () => {
    await driver.set("name", "Hasan");
    expect(sessionStorage.getItem("name")).not.toBeNull();
    expect(localStorage.getItem("name")).toBeNull();
  });

  it("set / get round-trips primitives and objects", async () => {
    await driver.set("s", "Hasan");
    await driver.set("n", 42);
    await driver.set("o", { id: 1 });
    expect(await driver.get("s")).toBe("Hasan");
    expect(await driver.get("n")).toBe(42);
    expect(await driver.get("o")).toEqual({ id: 1 });
  });

  it("every storage method returns a promise", () => {
    expect(driver.set("name", "Hasan")).toBeInstanceOf(Promise);
    expect(driver.get("name")).toBeInstanceOf(Promise);
    expect(driver.has("name")).toBeInstanceOf(Promise);
    expect(driver.keys()).toBeInstanceOf(Promise);
    expect(driver.remove("name")).toBeInstanceOf(Promise);
    expect(driver.clear()).toBeInstanceOf(Promise);
  });

  it("get() returns the default value when the key is missing", async () => {
    expect(await driver.get("ghost", "default")).toBe("default");
  });

  it("has() reports presence correctly", async () => {
    expect(await driver.has("name")).toBe(false);
    await driver.set("name", "Hasan");
    expect(await driver.has("name")).toBe(true);
  });

  it("remove() drops the key", async () => {
    await driver.set("name", "Hasan");
    await driver.remove("name");
    expect(await driver.has("name")).toBe(false);
  });

  it("clear() empties the backing storage", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    await driver.clear();
    expect(await driver.has("a")).toBe(false);
    expect(await driver.has("b")).toBe(false);
  });

  it("keys() lists the stored keys", async () => {
    await driver.set("a", 1);
    await driver.set("b", 2);
    expect((await driver.keys()).sort()).toEqual(["a", "b"]);
  });

  it("setPrefixKey() applies a prefix to every key", async () => {
    driver.setPrefixKey("app-");
    await driver.set("name", "Hasan");
    expect(sessionStorage.getItem("app-name")).not.toBeNull();
    expect(await driver.get("name")).toBe("Hasan");
    await driver.remove("name");
  });

  it("expired entries return the default", async () => {
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
