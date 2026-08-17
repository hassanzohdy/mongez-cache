import { CacheDriverInterface } from "../types";
import BaseCacheEngine from "./BaseCacheEngine";

export default class RunTimeDriver
  extends BaseCacheEngine
  implements CacheDriverInterface
{
  /**
   * Set the storage engine
   */
  public storage = this;

  /**
   * Data list
   *
   * Backed by a `Map` rather than a plain object: cache keys are
   * caller-controlled, and on a plain object keys like `__proto__`,
   * `constructor` or `toString` resolve through the prototype chain.
   * That made `has("constructor")` report `true` without anything
   * being set, `set("__proto__", value)` write to the store's
   * prototype instead of the store, and `remove("__proto__")` a silent
   * no-op. A `Map` has no prototype-chain lookup, so every key is
   * treated as plain data.
   */
  public data = new Map<string, any>();

  /**
   * Get item
   *
   * Returns `null` for missing keys (when no `defaultValue` is given)
   * to match the Web Storage API contract. The previous implementation
   * returned `undefined`, which broke `BaseCacheEngine.has()` — the
   * base engine checks `getItem(...) !== null` and `undefined !== null`
   * is `true`, so `has(missingKey)` reported `true` on this driver.
   */
  public getItem(key: string, defaultValue: any = null) {
    const data = this.data.get(key);

    if (!data) return defaultValue;

    if (data.expiresAt && data.expiresAt < new Date().getTime()) {
      this.removeItem(key);
      return defaultValue;
    }

    return data.value;
  }

  /**
   * Set item
   */
  public setItem(key: string, value: any, expiresAfter?: number) {
    this.data.set(key, {
      value,
      expiresAt: expiresAfter
        ? new Date().getTime() + expiresAfter * 1000
        : undefined,
    });
  }

  /**
   * Remove item
   */
  public removeItem(key: string) {
    this.data.delete(key);
  }

  /**
   * {@inheritDoc}
   */
  protected convertValue(value: any) {
    return value;
  }

  /**
   * {@inheritDoc}
   */
  protected parseValue(value: any) {
    return value;
  }

  /**
   * {@inheritDoc}
   */
  protected storageKeys(): string[] {
    return [...this.data.keys()];
  }

  /**
   * Clear the cache storage
   *
   * Overridden because `storage` points back at the driver itself, so
   * the base implementation's `storage.clear()` fallback would recurse
   * into this very method. Prefix scoping matches the base engine: with
   * a prefix only the owned keys are dropped, without one the whole
   * in-memory store is wiped.
   */
  public clear() {
    const prefix = this.getPrefixKey();

    if (!prefix) {
      this.data.clear();

      return this;
    }

    for (const key of this.storageKeys()) {
      if (key.startsWith(prefix)) {
        this.data.delete(key);
      }
    }

    return this;
  }
}
