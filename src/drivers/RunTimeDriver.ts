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
  protected data: any = {};

  /**
   * Get item
   */
  public getItem(key: string) {
    return this.data[key];
  }

  /**
   * Set item
   */
  public setItem(key: string, value: any) {
    this.data[key] = value;
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
