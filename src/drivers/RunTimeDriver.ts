import BaseCacheEngine from "./BaseCacheEngine";

export default class RunTimeDriver extends BaseCacheEngine {
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
}
