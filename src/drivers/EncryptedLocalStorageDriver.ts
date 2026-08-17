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
   */
  public set(key: string, value: any, expiresAfter?: number) {
    const expireTime: number | false =
      expiresAfter !== undefined
        ? expiresAfter
        : ((getCacheConfig("expiresAfter") || 0) as number);

    const expiresAt = expireTime
      ? new Date().getTime() + expireTime * 1000
      : undefined;

    this.storage.setItem(
      this.getKey(key),
      getCacheConfig("encryption")?.encrypt({
        data: value,
        expiresAt,
      })
    );

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
   */
  public get(key: string, defaultValue: any = null) {
    let value = this.storage.getItem(this.getKey(key));

    if (!value) return defaultValue;

    try {
      const decrypted = getCacheConfig("encryption")?.decrypt(value);

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
        this.remove(key);
        return defaultValue;
      }

      return decrypted.data;
    } catch (error) {
      this.remove(key);
      return defaultValue;
    }
  }

  /**
   * Remove key from storage
   */
  public remove(key: string) {
    this.storage.removeItem(this.getKey(key));

    return this;
  }
}
