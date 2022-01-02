import { CacheDriverInterface, CacheManagerInterface } from "./types";

export class CacheManager implements CacheManagerInterface {
  /**
   * Cache Driver Engine
   *
   * @var {CacheDriverInterface}
   */
  private driver: CacheDriverInterface;

  /**
   * Set driver engine
   *
   * @param CacheDriverInterface driver
   */
  public setDriver(driver: CacheDriverInterface): void {
    this.driver = driver;
  }

  /**
   * Get driver engine
   *
   * @returns {CacheDriverInterface}
   */
  public getDriver(): CacheDriverInterface {
    return this.driver;
  }

  /**
   * Set cache into storage
   * @param {string} key
   * @param {any} value
   */
  public set(key: string, value: any): void {
    this.driver.set(key, value);
  }

  /**
   * Get value from cache engine, if key does not exist return default value
   * @param {string} key
   * @param {any} defaultValue
   */
  public get(key: string, defaultValue: any = null): any {
    return this.driver.get(key, defaultValue);
  }

  /**
   * Determine whether the cache engine has the given key
   *
   * @param {string} key
   * @returns {boolean}
   */
  public has(key: string): boolean {
    return this.driver.has(key);
  }

  /**
   * Remove the given key from the cache storage
   *
   * @param  {string} key
   */
  public remove(key: string): void {
    this.driver.remove(key);
  }

  /**
   * Set prefix key
   */
  public setPrefixKey(key: string): void {
    this.driver.setPrefixKey(key);
  }

  /**
   * Get prefix key
   */
  public getPrefixKey(): string {
    return this.driver.getPrefixKey();
  }
}

const cacheManager = new CacheManager();

export default cacheManager;
