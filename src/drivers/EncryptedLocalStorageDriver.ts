import { getCacheConfig } from "../config";
import { CacheDriverInterface } from "../types";
import PlainLocalStorageDriver from "./PlainLocalStorageDriver";

export default class EncryptedLocalStorageDriver
  extends PlainLocalStorageDriver
  implements CacheDriverInterface
{
  /**
   * Set data into storage engine
   *
   * Wraps the value in a `{data, expiresAt}` envelope (matching the
   * plain driver shape) BEFORE encrypting, so the encrypted variant
   * honors `expiresAfter` just like the plain drivers do.
   *
   * The configured `encrypt` is awaited: @mongez/encryption 2.x returns
   * a promise (WebCrypto AES-GCM cannot be synchronous), while 1.x
   * returned a string. `await` accepts both.
   */
  public async set(key: string, value: any, expiresAfter?: number) {
    const expireTime: number | false =
      expiresAfter !== undefined
        ? expiresAfter
        : ((getCacheConfig("expiresAfter") || 0) as number);

    const expiresAt = expireTime
      ? new Date().getTime() + expireTime * 1000
      : undefined;

    const encryption = getCacheConfig("encryption");

    const cypher = await encryption?.encrypt({
      data: value,
      expiresAt,
    });

    await this.write(this.getKey(key), cypher);

    return this;
  }

  /**
   * Get value from storage engine
   *
   * Decrypts then unwraps the `{data, expiresAt}` envelope and checks
   * expiry. For backward compatibility with legacy cyphers that were
   * written before the envelope was introduced (no `data` / `expiresAt`
   * keys), the decrypted value is returned as-is with no expiration.
   *
   * A cypher that fails to decrypt (tampered entry, rotated key,
   * truncated write) must not make every subsequent read throw, so the
   * poisoned entry is evicted and the default value is returned —
   * the same self-healing behavior `BaseCacheEngine.get()` implements.
   * With an authenticated cipher (AES-GCM) that eviction is also the
   * tamper response: a modified cypher fails the tag check, so it is
   * dropped rather than returned as data.
   */
  public async get(key: string, defaultValue: any = null) {
    const value = await this.read(this.getKey(key));

    if (!value) return defaultValue;

    try {
      const decrypted = await getCacheConfig("encryption")?.decrypt(value);

      // Legacy format detection: pre-envelope cyphers decrypt to
      // arbitrary user data (string / number / object without
      // `data` + `expiresAt` keys). Treat those as immortal entries.
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
   * Determine whether the cache engine has a live entry for the key
   *
   * Presence is decided without decrypting: the cypher is opaque, and
   * running the (now async) decrypt on every `has()` would leak both
   * CPU and, on a rotated key, entries — an eviction is a write, and a
   * read-shaped call should not silently rewrite storage. Expiry is
   * therefore enforced by `get()`, which has to decrypt anyway.
   */
  public async has(key: string): Promise<boolean> {
    const value = await this.read(this.getKey(key));

    return value !== null && value !== undefined;
  }

  /**
   * Remove key from storage
   */
  public async remove(key: string) {
    await this.delete(this.getKey(key));

    return this;
  }
}
