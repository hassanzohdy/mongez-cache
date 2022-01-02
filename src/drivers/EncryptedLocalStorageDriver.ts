import PlainLocalStorageDriver from "./PlainLocalStorageDriver";
import { CacheDriverInterface } from "../types";
import { decrypt, encrypt } from "@mongez/encryption";

export default class EncryptedLocalStorageDriver
  extends PlainLocalStorageDriver
  implements CacheDriverInterface
{
  /**
   * Set data into storage engine
   * @param {string} key
   * @param {value} value
   */
  public set(key: string, value: any) {
    this.storage.setItem(this.getKey(key), encrypt(value));
  }

  /**
   * Get vale from storage engine
   *
   * @param   {string} key
   * @returns {any}
   */
  public get(key: string, defaultValue: any = null) {
    let value = this.storage.getItem(this.getKey(key));

    return value ? decrypt(value) : defaultValue;
  }

  /**
   * Remove key from storage
   *
   * @param  {string} key
   */
  public remove(key: string) {
    this.storage.removeItem(this.getKey(key));
  }
}
