import { CacheDriverInterface, CacheManagerInterface } from "./types";

export class CacheManager implements CacheManagerInterface {
  /**
   * Cache Driver Engine
   */
  private driver!: CacheDriverInterface;

  /**
   * Set driver engine
   */
  public setDriver(driver: CacheDriverInterface) {
    this.driver = driver;
    return this;
  }

  /**
   * Get driver engine
   */
  public getDriver(): CacheDriverInterface {
    return this.driver;
  }

  /**
   * Set cache into storage
   */
  public set(key: string, value: any, expiresAfter?: number) {
    this.driver.set(key, value, expiresAfter);
    return this;
  }

  /**
   * Get value from cache engine, if key does not exist return default value
   */
  public get(key: string, defaultValue: any = null) {
    return this.driver.get(key, defaultValue);
  }

  /**
   * Determine whether the cache engine has the given key
   */
  public has(key: string) {
    return this.driver.has(key);
  }

  /**
   * Remove the given key from the cache storage
   */
  public remove(key: string) {
    this.driver.remove(key);
    return this;
  }

  /**
   * Set prefix key
   */
  public setPrefixKey(key: string) {
    this.driver.setPrefixKey(key);
    return this;
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
