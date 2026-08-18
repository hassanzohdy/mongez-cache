import { CacheDriverInterface, CacheManagerInterface } from "./types";

/**
 * The cache facade.
 *
 * Every storage-touching method forwards to the active driver and
 * returns the driver's promise, so swapping localStorage for IndexedDB
 * (or for a driver of your own that talks to a remote store) does not
 * change a single call site. Driver configuration — prefix, value
 * parser, value converter — stays synchronous and chainable.
 */
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
  public async set(key: string, value: any, expiresAfter?: number) {
    await this.driver.set(key, value, expiresAfter);
    return this as any;
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
  public async remove(key: string) {
    await this.driver.remove(key);
    return this as any;
  }

  /**
   * List the caller-facing keys owned by the active driver
   */
  public keys(): Promise<string[]> {
    return this.driver.keys();
  }

  /**
   * Read every live entry owned by the active driver
   */
  public getAll(): Promise<Record<string, any>> {
    return this.driver.getAll();
  }

  /**
   * Set prefix key
   */
  public setPrefixKey(key: string) {
    this.driver.setPrefixKey(key);
    return this as any;
  }

  /**
   * Get prefix key
   */
  public getPrefixKey(): string {
    return this.driver.getPrefixKey();
  }

  /**
   * {@inheritDoc}
   */
  public setValueParser(parser: any): CacheDriverInterface {
    this.driver.setValueParser(parser);

    return this;
  }

  /**
   * {@inheritDoc}
   */
  public setValueConverter(converter: any): CacheDriverInterface {
    this.driver.setValueConverter(converter);

    return this;
  }

  /**
   * Clear the cache storage
   */
  public async clear() {
    await this.driver.clear();

    return this;
  }
}

const cacheManager = new CacheManager();

export default cacheManager;
