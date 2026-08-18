/**
 * The cache driver contract.
 *
 * As of 2.0.0 every method that touches the storage backend is async.
 * Web Storage and the in-memory runtime store answer synchronously and
 * simply lift their result into a resolved promise, while IndexedDB (and
 * any consumer-supplied remote backend) is asynchronous by nature. One
 * contract means a driver can be swapped for another without rewriting
 * every call site — which is the whole point of the facade.
 *
 * The configuration setters (prefix key, value parser / converter) stay
 * synchronous: they mutate the driver, not the storage, and keeping them
 * sync preserves fluent chaining such as
 * `new RunTimeDriver().setPrefixKey("app-")`.
 */
export type CacheDriverInterface = {
  /**
   * Set cache into storage
   */
  set(
    key: string,
    value: any,
    expiresAfter?: number
  ): Promise<CacheDriverInterface>;

  /**
   * Get value from cache engine, if key does not exist return default value
   */
  get(key: string, defaultValue?: any): Promise<any>;

  /**
   * Set value parser
   */
  setValueParser(parser: any): CacheDriverInterface;

  /**
   * Set value converter
   */
  setValueConverter(converter: any): CacheDriverInterface;

  /**
   * Determine whether the cache engine has a live (non-expired) entry
   * for the given key
   */
  has(key: string): Promise<boolean>;

  /**
   * Remove the given key from the cache storage
   */
  remove(key: string): Promise<CacheDriverInterface>;

  /**
   * Set prefix key
   */
  setPrefixKey(key: string): CacheDriverInterface;

  /**
   * Get prefix key
   */
  getPrefixKey(): string;

  /**
   * List the caller-facing keys owned by this engine
   *
   * The configured prefix is stripped from the returned keys, so what
   * comes out can be fed straight back into `get` / `remove`.
   */
  keys(): Promise<string[]>;

  /**
   * Read every live (non-expired) entry owned by this engine in one go
   *
   * Keyed by the caller-facing key (prefix stripped), same as `keys()`.
   * The returned object has a null prototype and every key is defined as
   * an own property, so a stored key of `__proto__`, `constructor` or
   * `prototype` lands as inert data instead of reaching a prototype
   * setter.
   */
  getAll(): Promise<Record<string, any>>;

  /**
   * Clear the cache storage
   */
  clear(): Promise<CacheDriverInterface>;
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

/**
 * Encryption handlers.
 *
 * Both hooks may be synchronous or asynchronous — the drivers `await`
 * whatever they return. @mongez/encryption 2.x is async (WebCrypto
 * AES-GCM), 1.x was synchronous (crypto-js), and both plug in unchanged.
 */
export type CacheEncryptionConfigurations = {
  /**
   * Encrypt function
   */
  encrypt: (value: any) => Promise<string> | string;
  /**
   * Decrypt function
   */
  decrypt: (value: string) => Promise<any> | any;
};

/**
 * Options for the IndexedDB driver.
 *
 * The driver is opt-in: nothing constructs it for you, because opening a
 * database is a side effect no consumer should get by importing the
 * package.
 */
export type IndexedDBDriverOptions = {
  /**
   * Database name
   *
   * @default "mongez-cache"
   */
  databaseName?: string;
  /**
   * Object store name
   *
   * @default "cache"
   */
  storeName?: string;
  /**
   * Database version
   *
   * Bump it when you change the schema; `onUpgrade` is called with the
   * old and new version so you can migrate.
   *
   * @default 1
   */
  version?: number;
  /**
   * Migration hook, called inside the `versionchange` transaction.
   *
   * The cache object store is created for you before this runs, so the
   * hook only has to deal with data migration / extra indexes. Anything
   * async in here will NOT be awaited — IndexedDB closes the upgrade
   * transaction the moment control returns to the event loop.
   */
  onUpgrade?: (context: IndexedDBUpgradeContext) => void;
};

/**
 * The context handed to {@link IndexedDBDriverOptions.onUpgrade}.
 */
export type IndexedDBUpgradeContext = {
  /**
   * The database being upgraded
   */
  database: IDBDatabase;
  /**
   * The cache object store, inside the upgrade transaction
   */
  store: IDBObjectStore;
  /**
   * Version the database is upgrading from — 0 on first creation
   */
  oldVersion: number;
  /**
   * Version the database is upgrading to
   */
  newVersion: number;
  /**
   * The raw upgrade transaction, for advanced migrations
   */
  transaction: IDBTransaction;
};

/**
 * The record shape stored by the IndexedDB driver.
 */
export type IndexedDBCacheRecord = {
  /**
   * The cached value (already run through the value converter)
   */
  value: any;
  /**
   * Absolute expiry timestamp in milliseconds, `undefined` when the
   * entry never expires
   */
  expiresAt?: number;
};

export type CacheConfigurations = {
  /**
   * The Cache drier interface
   */
  driver: CacheDriverInterface;
  /**
   * Set value parser when getting value from cache
   */
  valueParer?: (value: any) => any;
  /**
   * Set value converter when setting value to cache
   */
  valueConverter?: (value: any) => any;
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
  /**
   * Encryption handlers
   */
  encryption?: CacheEncryptionConfigurations;
};
