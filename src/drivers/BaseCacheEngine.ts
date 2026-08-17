import { getCacheConfig } from "../config";
import { CacheDriverInterface } from "../types";

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
   * Get vale from storage engine
   */
  public get(key: string, defaultValue?: any) {
    let value = this.storage.getItem(this.getKey(key));

    if (value === null) return defaultValue;

    try {
      const cachedData = this._valueParser(value);

      // check if there is a cache timestamp
      // if it is lower than current timestamp
      // then remove the key from storage
      if (cachedData.expiresAt && cachedData.expiresAt < new Date().getTime()) {
        this.remove(key);
        return defaultValue;
      }

      return cachedData.data;
    } catch (error) {
      this.remove(key);
      return defaultValue;
    }
  }

  /**
   * Set data into storage engine
   */
  public set(key: string, value: any, expiresAfter?: number) {
    const expireTime: number | false =
      expiresAfter !== undefined
        ? expiresAfter
        : ((getCacheConfig("expiresAfter") || 0) as number);

    const expiresAt = expireTime
      ? new Date().getTime() + expireTime * 1000
      : undefined;

    this.storage.setItem(
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
   * Determine whether the cache engine has the given key
   */
  public has(key: string): boolean {
    return this.storage.getItem(this.getKey(key)) !== null;
  }

  /**
   * Remove key from storage
   */
  public remove(key: string) {
    this.storage.removeItem(this.getKey(key));
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
  protected storageKeys(): string[] {
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
  public clear() {
    const prefix = this.getPrefixKey();

    if (!prefix) {
      this.storage.clear();

      return this;
    }

    for (const key of this.storageKeys()) {
      if (key.startsWith(prefix)) {
        this.storage.removeItem(key);
      }
    }

    return this;
  }
}
