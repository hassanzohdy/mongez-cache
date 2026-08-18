import { getCacheConfig } from "../config";
import { CacheQuotaExceededError } from "../errors";
import { CacheDriverInterface, IndexedDBCacheRecord } from "../types";
import IndexedDBDriver from "./IndexedDBDriver";

/**
 * IndexedDB driver whose payload is encrypted at rest.
 *
 * The whole `{data, expiresAt}` envelope is encrypted — the same shape
 * the encrypted Web Storage drivers write — so the expiry travels
 * *inside* the authenticated cypher and cannot be extended by anyone who
 * can write to the database.
 *
 * `expiresAt` is ALSO stored in the clear on the record, because the
 * driver has to evict expired entries without decrypting every row
 * (a rotated key would otherwise leave the database growing forever).
 * The two are checked in order, so the effective expiry is the earlier
 * of the two: pushing the plaintext copy further out buys an attacker
 * nothing, and pulling it in only evicts an entry they could have
 * deleted outright anyway. What the plaintext copy does leak is *when*
 * an entry expires — a session length, roughly. If that matters more
 * than unbounded growth on a stale key, set no TTL.
 */
export default class EncryptedIndexedDBDriver
  extends IndexedDBDriver
  implements CacheDriverInterface
{
  /**
   * Set cache into storage
   */
  public async set(key: string, value: any, expiresAfter?: number) {
    const expiresAt = this.expiryOf(expiresAfter);

    const cypher = await getCacheConfig("encryption")?.encrypt({
      data: value,
      expiresAt,
    });

    const record: IndexedDBCacheRecord = { value: cypher, expiresAt };

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
   * Get value from cache engine, if key does not exist return default value
   *
   * A cypher that fails to decrypt — tampered record, rotated key,
   * truncated write — is evicted and the default value returned, so one
   * poisoned row cannot make every later read throw. With AES-GCM the
   * failed authentication tag lands here too, which makes eviction the
   * tamper response as well.
   */
  public async get(key: string, defaultValue: any = null) {
    const record = await this.record(key);

    if (record === undefined || record === null) return defaultValue;

    if (this.isExpired(record)) {
      await this.remove(key);
      return defaultValue;
    }

    try {
      const decrypted = await getCacheConfig("encryption")?.decrypt(
        record.value
      );

      // Legacy / non-envelope cyphers: return whatever came out, with
      // no expiry, matching the encrypted Web Storage drivers.
      if (
        decrypted === null ||
        decrypted === undefined ||
        typeof decrypted !== "object" ||
        !("data" in decrypted)
      ) {
        return decrypted === null || decrypted === undefined
          ? defaultValue
          : decrypted;
      }

      // The authenticated copy of the expiry wins over the plaintext
      // one on the record.
      if (decrypted.expiresAt && decrypted.expiresAt < new Date().getTime()) {
        await this.remove(key);
        return defaultValue;
      }

      return decrypted.data;
    } catch (error) {
      await this.remove(key);
      return defaultValue;
    }
  }

  /**
   * Read every live entry owned by this engine
   *
   * Overridden because the base implementation reads records in one
   * transaction and cannot `await` a decrypt inside it — the records
   * are collected first, then decrypted key by key through `get()`.
   */
  public async getAll(): Promise<Record<string, any>> {
    const entries: Record<string, any> = Object.create(null);

    for (const key of await this.keys()) {
      const value = await this.get(key, undefined);

      if (value === undefined) continue;

      Object.defineProperty(entries, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    return entries;
  }
}
