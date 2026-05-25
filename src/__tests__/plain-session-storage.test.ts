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

  afterEach(() => {
    driver.clear();
  });

  it("uses sessionStorage, not localStorage", () => {
    driver.set("name", "Hasan");
    expect(sessionStorage.getItem("name")).not.toBeNull();
    expect(localStorage.getItem("name")).toBeNull();
  });

  it("set / get round-trips primitives and objects", () => {
    driver.set("s", "Hasan");
    driver.set("n", 42);
    driver.set("o", { id: 1 });
    expect(driver.get("s")).toBe("Hasan");
    expect(driver.get("n")).toBe(42);
    expect(driver.get("o")).toEqual({ id: 1 });
  });

  it("get() returns the default value when the key is missing", () => {
    expect(driver.get("ghost", "default")).toBe("default");
  });

  it("has() reports presence correctly", () => {
    expect(driver.has("name")).toBe(false);
    driver.set("name", "Hasan");
    expect(driver.has("name")).toBe(true);
  });

  it("remove() drops the key", () => {
    driver.set("name", "Hasan");
    driver.remove("name");
    expect(driver.has("name")).toBe(false);
  });

  it("clear() empties the backing storage", () => {
    driver.set("a", 1);
    driver.set("b", 2);
    driver.clear();
    expect(driver.has("a")).toBe(false);
    expect(driver.has("b")).toBe(false);
  });

  it("setPrefixKey() applies a prefix to every key", () => {
    driver.setPrefixKey("app-");
    driver.set("name", "Hasan");
    expect(sessionStorage.getItem("app-name")).not.toBeNull();
    expect(driver.get("name")).toBe("Hasan");
    driver.remove("name");
  });

  it("expired entries return the default", () => {
    vi.useFakeTimers();
    try {
      driver.set("name", "Hasan", 1);
      vi.advanceTimersByTime(2 * 1000);
      expect(driver.get("name", "default")).toBe("default");
    } finally {
      vi.useRealTimers();
    }
  });
});
