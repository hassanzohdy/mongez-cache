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
  public prefixKey: string;

  /**
   * Set data into storage engine
   */
  public set(key: string, value: any, expiresAfter?: number) {
    let expireTime: number | false =
      expiresAfter !== undefined
        ? expiresAfter
        : ((getCacheConfig("expiresAfter") || 0) as number);

    let expiresAt = expireTime ? new Date().getTime() + expireTime : undefined;

    this.storage.setItem(
      this.getKey(key),
      JSON.stringify({
        data: value,
        expiresAt,
      })
    );

    return this;
  }

  /**
   * Get vale from storage engine
   */
  public get(key: string, defaultValue: any = null) {
    let value = this.storage.getItem(this.getKey(key));

    if (!value) return defaultValue;

    try {
      const cachedData = JSON.parse(value);

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
}
