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
   * Clear the cache storage
   */
  public clear() {
    this.storage.clear();
    return this;
  }
}
