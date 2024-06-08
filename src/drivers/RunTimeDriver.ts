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
   */
  public data: any = {};

  /**
   * Get item
   */
  public getItem(key: string, defaultValue?: any) {
    const data = this.data[key];

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
    this.data[key] = {
      value,
      expiresAt: expiresAfter
        ? new Date().getTime() + expiresAfter * 1000
        : undefined,
    };
  }

  /**
   * Remove item
   */
  public removeItem(key: string) {
    delete this.data[key];
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
   * Clear the cache storage
   */
  public clear() {
    this.data = {};

    return this;
  }
}
