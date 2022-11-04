import { CacheDriverInterface } from "../types";
import BaseCacheEngine from "./BaseCacheEngine";

export default class PlainSessionStorageDriver
  extends BaseCacheEngine
  implements CacheDriverInterface
{
  /**
   * Set the storage engine
   */
  public storage = sessionStorage;
}
