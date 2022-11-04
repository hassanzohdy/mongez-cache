import { CacheDriverInterface } from "../types";
import EncryptedLocalStorageDriver from "./EncryptedLocalStorageDriver";

export default class EncryptedSessionStorageDriver
  extends EncryptedLocalStorageDriver
  implements CacheDriverInterface
{
  /**
   * Set the storage engine
   */
  public storage = sessionStorage;
}
