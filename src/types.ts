export type CacheDriverInterface = {
  /**
   * Set cache into storage
   * @param {string} key
   * @param {any} value
   */
  set(key: string, value: any): void;

  /**
   * Get value from cache engine, if key does not exist return default value
   * @param {string} key
   * @param {any} defaultValue
   */
  get(key: string, defaultValue: any): any;

  /**
   * Determine whether the cache engine has the given key
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key: string): boolean;

  /**
   * Remove the given key from the cache storage
   *
   * @param  {string} key
   */
  remove(key: string): void;
  /**
   * Set prefix key
   */
  setPrefixKey(key: string): void;
  /**
   * Get prefix key
   */
  getPrefixKey(): string;
};

export interface CacheManagerInterface extends CacheDriverInterface {
  /**
   * Set driver engine
   *
   * @param CacheDriverInterface driver
   */
  setDriver(driver: CacheDriverInterface): void;
  /**
   * Get driver engine
   *
   * @returns {CacheDriverInterface}
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
};
