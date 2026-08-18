import { getCacheConfig } from "../config";
import {
  CacheQuotaExceededError,
  IndexedDBBlockedError,
  IndexedDBUnavailableError,
} from "../errors";
import {
  CacheDriverInterface,
  IndexedDBCacheRecord,
  IndexedDBDriverOptions,
} from "../types";
import isForbiddenKey from "./isForbiddenKey";

/**
 * Defaults for the IndexedDB driver.
 *
 * Exported so a consumer can reuse the same database from their own
 * tooling (a "clear all caches" button, a devtools panel) without
 * hard-coding the strings.
 */
export const DEFAULT_INDEXED_DB_NAME = "mongez-cache";
export const DEFAULT_INDEXED_DB_STORE = "cache";
export const DEFAULT_INDEXED_DB_VERSION = 1;

/**
 * IndexedDB cache driver — opt-in.
 *
 * Unlike the Web Storage drivers this one is never wired up for you:
 * opening a database is a side effect, and a package import should not
 * create one. Pass an instance explicitly:
 *
 * ```ts
 * setCacheConfigurations({ driver: new IndexedDBDriver() });
 * ```
 *
 * Storage layout: a single object store with out-of-line keys, where the
 * key is the (prefixed) cache key and the record is
 * `{ value, expiresAt }`. Values go through the structured clone
 * algorithm, so `Date`, `Map`, `Set`, `ArrayBuffer` and friends survive
 * a round-trip untouched — no JSON pass by default. Values that are not
 * cloneable (functions, class instances with methods, DOM nodes) are
 * rejected by the browser; give the driver a `setValueConverter` /
 * `setValueParser` pair if you need to serialize those yourself.
 *
 * Why IndexedDB is not the default: it is asynchronous, per-origin
 * quota'd, and unavailable during server-side rendering, while
 * localStorage is present in every browser context the other drivers
 * already support. Consumers who need more than the ~5MB Web Storage
 * budget, or structured values, opt in.
 */
export default class IndexedDBDriver implements CacheDriverInterface {
  /**
   * Prefix key
   */
  public prefixKey: string = "";

  /**
   * Database name
   */
  public readonly databaseName: string;

  /**
   * Object store name
   */
  public readonly storeName: string;

  /**
   * Database version
   */
  public readonly version: number;

  /**
   * Migration hook
   */
  protected readonly onUpgrade?: IndexedDBDriverOptions["onUpgrade"];

  /**
   * The memoized open-database promise
   *
   * Every operation awaits this one promise, so N concurrent calls made
   * before the database is open share a single `open()` request instead
   * of racing each other into N connections.
   */
  protected connection?: Promise<IDBDatabase>;

  /**
   * Value parser
   */
  protected _valueParser = this.parseValue.bind(this);

  /**
   * Value converter
   */
  protected _valueConverter = this.convertValue.bind(this);

  public constructor(options: IndexedDBDriverOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_INDEXED_DB_NAME;
    this.storeName = options.storeName ?? DEFAULT_INDEXED_DB_STORE;
    this.version = options.version ?? DEFAULT_INDEXED_DB_VERSION;
    this.onUpgrade = options.onUpgrade;
  }

  /**
   * Determine whether the current runtime can use this driver
   *
   * Use it to pick a driver at bootstrap instead of catching the
   * `IndexedDBUnavailableError` thrown by the first read.
   */
  public static isSupported(): boolean {
    return (
      typeof globalThis !== "undefined" &&
      Boolean((globalThis as any).indexedDB)
    );
  }

  /**
   * Resolve the `indexedDB` factory or fail loudly
   *
   * Looked up lazily — at call time, never at import or construction
   * time — so that a module that merely *mentions* this driver can be
   * bundled into a server-rendered app without exploding on import.
   */
  protected factory(): IDBFactory {
    const factory =
      typeof globalThis !== "undefined"
        ? ((globalThis as any).indexedDB as IDBFactory | undefined)
        : undefined;

    if (!factory) {
      throw new IndexedDBUnavailableError();
    }

    return factory;
  }

  /**
   * Open (once) and return the database connection
   */
  protected database(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;

    const factory = this.factory();

    const connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(this.databaseName, this.version);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const database = request.result;
        const transaction = request.transaction as IDBTransaction;

        // Created on first open, reused on every later version bump so
        // that a migration keeps the existing entries.
        const store = database.objectStoreNames.contains(this.storeName)
          ? transaction.objectStore(this.storeName)
          : database.createObjectStore(this.storeName);

        this.onUpgrade?.({
          database,
          store,
          transaction,
          oldVersion: event.oldVersion,
          newVersion: event.newVersion ?? this.version,
        });
      };

      // Another tab still holds an older version open, so this upgrade
      // can never run. Reject instead of hanging forever.
      request.onblocked = () => {
        reject(new IndexedDBBlockedError(this.databaseName));
      };

      request.onsuccess = () => {
        const database = request.result;

        // When another tab upgrades the schema, drop this connection so
        // it does not block that upgrade; the next operation reopens.
        database.onversionchange = () => {
          database.close();
          this.connection = undefined;
        };

        resolve(database);
      };

      request.onerror = () => reject(request.error);
    });

    // A failed open must not be memoized forever — a transient failure
    // (a blocked upgrade that later clears) would otherwise poison the
    // driver for the lifetime of the page.
    this.connection = connection;
    connection.catch(() => {
      if (this.connection === connection) this.connection = undefined;
    });

    return connection;
  }

  /**
   * Close the database connection
   *
   * The next operation reopens it. Mostly useful in tests and in code
   * that deletes the database.
   */
  public async close(): Promise<this> {
    const connection = this.connection;

    this.connection = undefined;

    if (!connection) return this;

    try {
      (await connection).close();
    } catch (error) {
      // Nothing to close — the open failed in the first place.
    }

    return this;
  }

  /**
   * Run a single request against the object store
   */
  protected async request<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest
  ): Promise<T> {
    const database = await this.database();

    return new Promise<T>((resolve, reject) => {
      let request: IDBRequest;

      try {
        const transaction = database.transaction(this.storeName, mode);
        request = run(transaction.objectStore(this.storeName));
      } catch (error) {
        // Structured-clone failures and closed-database errors are
        // thrown synchronously, not delivered as an error event.
        return reject(error);
      }

      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Determine whether an error is the browser's out-of-quota signal
   */
  protected isQuotaError(error: any): boolean {
    if (!error) return false;

    return (
      error.name === "QuotaExceededError" ||
      // Firefox's historical name for the same condition.
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22
    );
  }

  /**
   * Parse a stored value
   *
   * Identity by default: IndexedDB stores structured clones, so there
   * is nothing to decode.
   */
  protected parseValue(value: any) {
    return value;
  }

  /**
   * Convert a value before storing it
   */
  protected convertValue(value: any) {
    return value;
  }

  /**
   * Set value parser
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
   * Get a proper key
   */
  public getKey(key: string): string {
    return (this.getPrefixKey() || "") + key;
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
   * Compute the absolute expiry timestamp for a write
   */
  protected expiryOf(expiresAfter?: number): number | undefined {
    const expireTime: number | false =
      expiresAfter !== undefined
        ? expiresAfter
        : ((getCacheConfig("expiresAfter") || 0) as number);

    return expireTime ? new Date().getTime() + expireTime * 1000 : undefined;
  }

  /**
   * Read the raw record stored under a cache key
   */
  protected async record(
    key: string
  ): Promise<IndexedDBCacheRecord | undefined> {
    return this.request<IndexedDBCacheRecord | undefined>(
      "readonly",
      store => store.get(this.getKey(key))
    );
  }

  /**
   * Determine whether a record is past its expiry
   */
  protected isExpired(record: IndexedDBCacheRecord): boolean {
    return Boolean(record.expiresAt && record.expiresAt < new Date().getTime());
  }

  /**
   * Get value from cache engine, if key does not exist return default value
   */
  public async get(key: string, defaultValue: any = null) {
    const record = await this.record(key);

    if (record === undefined || record === null) return defaultValue;

    // Same TTL model as the other drivers: expiry is enforced on read,
    // and the dead entry is dropped rather than left to rot.
    if (this.isExpired(record)) {
      await this.remove(key);
      return defaultValue;
    }

    return this._valueParser(record.value);
  }

  /**
   * Set cache into storage
   */
  public async set(key: string, value: any, expiresAfter?: number) {
    const record: IndexedDBCacheRecord = {
      value: this._valueConverter(value),
      expiresAt: this.expiryOf(expiresAfter),
    };

    try {
      await this.request("readwrite", store =>
        store.put(record, this.getKey(key))
      );
    } catch (error) {
      if (this.isQuotaError(error)) {
        throw new CacheQuotaExceededError(key, error);
      }

      throw error;
    }

    return this;
  }

  /**
   * Determine whether the cache engine has a live entry for the key
   */
  public async has(key: string): Promise<boolean> {
    const record = await this.record(key);

    if (record === undefined || record === null) return false;

    if (this.isExpired(record)) {
      await this.remove(key);
      return false;
    }

    return true;
  }

  /**
   * Remove the given key from the cache storage
   */
  public async remove(key: string) {
    await this.request("readwrite", store => store.delete(this.getKey(key)));

    return this;
  }

  /**
   * List every key held in the object store
   */
  protected async storageKeys(): Promise<string[]> {
    const keys = await this.request<IDBValidKey[]>("readonly", store =>
      store.getAllKeys()
    );

    return keys.map(key => String(key));
  }

  /**
   * List the caller-facing keys owned by this engine
   */
  public async keys(): Promise<string[]> {
    const prefix = this.getPrefixKey();
    const keys = await this.storageKeys();

    if (!prefix) return keys;

    return keys
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }

  /**
   * Read every live entry owned by this engine in one transaction
   *
   * The returned object has a null prototype and every key is defined
   * as an own property, so a cache key of `__proto__`, `constructor` or
   * `prototype` — which any script sharing the origin can write into
   * the database — lands as plain data instead of reaching a prototype
   * setter and polluting every object in the runtime.
   */
  public async getAll(): Promise<Record<string, any>> {
    const prefix = this.getPrefixKey();
    const entries: Record<string, any> = Object.create(null);

    await this.eachRecord((key, record) => {
      if (prefix && !key.startsWith(prefix)) return;
      if (this.isExpired(record)) return;

      const cacheKey = prefix ? key.slice(prefix.length) : key;
      const value = this._valueParser(record.value);

      if (isForbiddenKey(cacheKey)) {
        // Belt and braces: a plain assignment is already safe on a
        // null-prototype object, but `defineProperty` cannot ever hit
        // an inherited setter even if this object gains a prototype.
        Object.defineProperty(entries, cacheKey, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });

        return;
      }

      entries[cacheKey] = value;
    });

    return entries;
  }

  /**
   * Walk every record in the store inside a single transaction
   */
  protected async eachRecord(
    handle: (key: string, record: IndexedDBCacheRecord) => void
  ): Promise<void> {
    const database = await this.database();

    return new Promise<void>((resolve, reject) => {
      let transaction: IDBTransaction;

      try {
        transaction = database.transaction(this.storeName, "readonly");
      } catch (error) {
        return reject(error);
      }

      const request = transaction.objectStore(this.storeName).openCursor();

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) return;

        handle(String(cursor.key), cursor.value as IndexedDBCacheRecord);
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Clear the cache storage
   *
   * Prefix-scoped exactly like the Web Storage engines: the cache
   * database is shared by every driver instance pointed at it, so an
   * app that namespaced its keys must not wipe its neighbour's. With no
   * prefix the engine owns the whole store and clears it.
   */
  public async clear() {
    const prefix = this.getPrefixKey();

    if (!prefix) {
      await this.request("readwrite", store => store.clear());

      return this;
    }

    const database = await this.database();

    await new Promise<void>((resolve, reject) => {
      let transaction: IDBTransaction;

      try {
        transaction = database.transaction(this.storeName, "readwrite");
      } catch (error) {
        return reject(error);
      }

      // A cursor keeps the deletions inside one transaction: issuing
      // them one promise at a time would let the transaction commit
      // between deletes and leave a half-cleared namespace behind.
      const request = transaction.objectStore(this.storeName).openCursor();

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) return;

        if (String(cursor.key).startsWith(prefix)) {
          cursor.delete();
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });

    return this;
  }
}
