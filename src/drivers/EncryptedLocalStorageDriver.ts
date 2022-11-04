import { decrypt, encrypt } from "@mongez/encryption";
import { CacheDriverInterface } from "../types";
import PlainLocalStorageDriver from "./PlainLocalStorageDriver";

export default class EncryptedLocalStorageDriver
  extends PlainLocalStorageDriver
  implements CacheDriverInterface
{
  /**
   * Set data into storage engine
   */
  public set(key: string, value: any) {
    this.storage.setItem(this.getKey(key), encrypt(value));
  }

  /**
   * Get vale from storage engine
   */
  public get(key: string, defaultValue: any = null) {
    let value = this.storage.getItem(this.getKey(key));

    return value ? decrypt(value) : defaultValue;
  }

  /**
   * Remove key from storage
   */
  public remove(key: string) {
    this.storage.removeItem(this.getKey(key));
  }
}
