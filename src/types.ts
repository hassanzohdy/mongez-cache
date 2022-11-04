export type CacheDriverInterface = {
  /**
   * Set cache into storage
   */
  set(key: string, value: any, expiresAfter?: number): CacheDriverInterface;

  /**
   * Get value from cache engine, if key does not exist return default value
   */
  get(key: string, defaultValue: any): any;

  /**
   * Determine whether the cache engine has the given key
   */
  has(key: string): boolean;

  /**
   * Remove the given key from the cache storage
   */
  remove(key: string): CacheDriverInterface;

  /**
   * Set prefix key
   */
  setPrefixKey(key: string): CacheDriverInterface;

  /**
   * Get prefix key
   */
  getPrefixKey(): string;
};

export interface CacheManagerInterface extends CacheDriverInterface {
  /**
   * Set driver engine
   */
  setDriver(driver: CacheDriverInterface): void;
  /**
   * Get driver engine
   */
  getDriver(): CacheDriverInterface;
}

export type CacheConfigurations = {
  /**
   * The Cache drier interface
   */
  driver: CacheDriverInterface;
  /**
   * A prefix for each key in the driver, this is useful for multi apps in same domain
   */
  prefix?: string;
  /**
   * Expire time of the cache in seconds
   *
   * @default Infinity
   */
  expiresAfter?: number;
};
