/**
 * Thrown when a driver needs `indexedDB` and the runtime does not have
 * it — server-side rendering, a Node build step, a worker without the
 * API, or a browser running in a mode that blocks storage entirely.
 *
 * Failing loudly beats silently degrading to "cache miss": a cache that
 * quietly stops persisting looks like a working cache right up until the
 * data that was supposed to be there is gone.
 */
export class IndexedDBUnavailableError extends Error {
  public constructor(
    message = "IndexedDB unavailable: `indexedDB` is not defined in this environment (server-side rendering, or storage is blocked). Use a different cache driver on the server."
  ) {
    super(message);
    this.name = "IndexedDBUnavailableError";
  }
}

/**
 * Thrown when the storage backend refuses a write because the origin is
 * out of quota.
 *
 * The browser's own `QuotaExceededError` is a `DOMException` whose
 * message says nothing about which cache overflowed, so it is wrapped
 * with the offending key and the original error kept as `cause`.
 */
export class CacheQuotaExceededError extends Error {
  public constructor(
    public readonly key: string,
    public readonly cause?: unknown
  ) {
    super(
      `Cache quota exceeded while writing "${key}": the storage backend is full. Remove entries, lower the TTL, or store less per key.`
    );
    this.name = "CacheQuotaExceededError";
  }
}

/**
 * Thrown when a driver is asked to open a database that another tab is
 * holding open at an older version.
 */
export class IndexedDBBlockedError extends Error {
  public constructor(databaseName: string) {
    super(
      `IndexedDB upgrade for "${databaseName}" is blocked by another open connection — close other tabs of this app and retry.`
    );
    this.name = "IndexedDBBlockedError";
  }
}
