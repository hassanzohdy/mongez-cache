import { getCacheConfig } from "../config";
import { CacheDriverInterface } from "../types";
import isForbiddenKey from "./isForbiddenKey";

/**
 * Base engine for the synchronous storage backends (Web Storage and the
 * in-memory runtime store).
 *
 * The backends themselves answer synchronously; every public method here
 * lifts their result into a promise (`Promise.resolve(...)`, through the
 * `read` / `write` / `delete` helpers) so that all drivers — including
 * the IndexedDB one, which cannot be synchronous — expose the exact same
 * async contract. No behavior changes for the Web Storage drivers: the
 * work still happens in the same tick, only the return type differs.
 */
export default class BaseCacheEngine implements CacheDriverInterface {
  /**
   * Cache storage engine
   */
  public storage: any;

  /**
   * Prefix key
   */
  public prefixKey: string = "";

  /**
   * Value parser
   */
  protected _valueParser = this.parseValue.bind(this);

  /**
   * Value converter
   */
  protected _valueConverter = this.convertValue.bind(this);

  /**
   * set value parser
   */
  public setValueParser(parser: any) {
    this._valueParser = parser;
    return this;
  }

  /**
   * Set value converter
   */
  public setValueConverter(converter: any) {
    this._valueConverter = converter;
    return this;
  }

  /**
   * Read a raw entry from the underlying (synchronous) storage
   */
  protected read(storageKey: string): Promise<any> {
    return Promise.resolve(this.storage.getItem(storageKey));
  }

  /**
   * Write a raw entry into the underlying (synchronous) storage
   */
  protected write(storageKey: string, value: any): Promise<void> {
    return Promise.resolve(this.storage.setItem(storageKey, value));
  }

  /**
   * Delete a raw entry from the underlying (synchronous) storage
   */
  protected delete(storageKey: string): Promise<void> {
    return Promise.resolve(this.storage.removeItem(storageKey));
  }

  /**
   * Get vale from storage engine
   */
  public async get(key: string, defaultValue?: any) {
    const value = await this.read(this.getKey(key));

    if (value === null || value === undefined) return defaultValue;

    try {
      const cachedData = this._valueParser(value);

      // check if there is a cache timestamp
      // if it is lower than current timestamp
      // then remove the key from storage
      if (cachedData.expiresAt && cachedData.expiresAt < new Date().getTime()) {
        await this.remove(key);
        return defaultValue;
      }

      return cachedData.data;
    } catch (error) {
      await this.remove(key);
      return defaultValue;
    }
  }

  /**
   * Set data into storage engine
   */
  public async set(key: string, value: any, expiresAfter?: number) {
    const expireTime: number | false =
      expiresAfter !== undefined
        ? expiresAfter
        : ((getCacheConfig("expiresAfter") || 0) as number);

    const expiresAt = expireTime
      ? new Date().getTime() + expireTime * 1000
      : undefined;

    await this.write(
      this.getKey(key),
      this._valueConverter({
        data: value,
        expiresAt,
      })
    );

    return this;
  }

  /**
   * Parse stored value
   */
  protected parseValue(value: any) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }

  /**
   * Set the mechanism to store data
   */
  protected convertValue(value: any) {
    return JSON.stringify(value);
  }

  /**
   * Determine whether the cache engine has a live entry for the key
   *
   * An expired entry counts as absent — and is evicted on the spot —
   * so `has()` and `get()` agree on every plain engine. Before 2.0.0 the
   * Web Storage engines reported an expired entry as present while the
   * runtime driver reported it as absent; consumers that branched on
   * `has()` then read `get()` saw a value appear and vanish.
   *
   * The encrypted engines override this: their payload is opaque until
   * decrypted, so they answer on presence alone.
   */
  public async has(key: string): Promise<boolean> {
    const value = await this.read(this.getKey(key));

    if (value === null || value === undefined) return false;

    try {
      const cachedData = this._valueParser(value);

      if (cachedData.expiresAt && cachedData.expiresAt < new Date().getTime()) {
        await this.remove(key);
        return false;
      }
    } catch (error) {
      // Unreadable but present: report it as present and let `get()`
      // do the self-healing eviction on the next read.
      return true;
    }

    return true;
  }

  /**
   * Remove key from storage
   */
  public async remove(key: string) {
    await this.delete(this.getKey(key));
    return this;
  }

  /**
   * Get a proper key
   */
  public getKey(key: string): string {
    key = (this.getPrefixKey() || "") + key;

    return key;
  }

  /**
   * Get prefix key
   */
  public getPrefixKey(): string {
    return this.prefixKey;
  }

  /**
   * Set prefix key
   */
  public setPrefixKey(key: string) {
    this.prefixKey = key;
    return this;
  }

  /**
   * List the keys currently held by the storage engine
   *
   * The returned array is a snapshot: Web Storage re-indexes itself on
   * every removal, so iterating `storage.length` while removing entries
   * silently skips keys.
   */
  protected async storageKeys(): Promise<string[]> {
    const storage = this.storage;

    if (!storage) return [];

    // Web Storage exposes an ordered `length` + `key(index)` pair.
    if (
      typeof storage.key === "function" &&
      typeof storage.length === "number"
    ) {
      const keys: string[] = [];

      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);

        if (key !== null) keys.push(key);
      }

      return keys;
    }

    return Object.keys(storage);
  }

  /**
   * List the caller-facing keys owned by this engine
   *
   * With a prefix configured, only the owned keys are listed and the
   * prefix is stripped so the result can be passed straight back to
   * `get()` / `remove()`. Without one the engine owns the whole
   * namespace, so everything in storage is returned.
   */
  public async keys(): Promise<string[]> {
    const prefix = this.getPrefixKey();
    const keys = await this.storageKeys();

    if (!prefix) return keys;

    return keys
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }

  /**
   * Read every live entry owned by this engine
   *
   * Built on top of `keys()` / `get()`, so it costs one read per owned
   * key. The returned object has a null prototype and every key is
   * defined as an own property, so a stored key of `__proto__`,
   * `constructor` or `prototype` lands as inert data instead of reaching
   * a prototype setter.
   */
  public async getAll(): Promise<Record<string, any>> {
    const entries: Record<string, any> = Object.create(null);
    const missing = Symbol("missing");

    for (const key of await this.keys()) {
      const value = await this.get(key, missing);

      if (value === missing) continue;

      if (isForbiddenKey(key)) {
        Object.defineProperty(entries, key, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });

        continue;
      }

      entries[key] = value;
    }

    return entries;
  }

  /**
   * Clear the cache storage
   *
   * Only the keys owned by this engine's prefix are removed, so several
   * apps sharing the same origin (and therefore the same localStorage /
   * sessionStorage) can clear their own namespace without destroying
   * each other's data.
   *
   * When no prefix is configured the engine owns the whole namespace,
   * so the historical behavior is kept and the entire storage is wiped.
   */
  public async clear() {
    const prefix = this.getPrefixKey();

    if (!prefix) {
      await Promise.resolve(this.storage.clear());

      return this;
    }

    for (const key of await this.storageKeys()) {
      if (key.startsWith(prefix)) {
        await this.delete(key);
      }
    }

    return this;
  }
}
