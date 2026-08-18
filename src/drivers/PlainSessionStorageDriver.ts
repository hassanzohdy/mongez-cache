import { CacheDriverInterface } from "../types";
import BaseCacheEngine from "./BaseCacheEngine";

export default class PlainSessionStorageDriver
  extends BaseCacheEngine
  implements CacheDriverInterface
{
  /**
   * Set the storage engine
   *
   * `sessionStorage` is synchronous; `BaseCacheEngine` wraps every call
   * to it in `Promise.resolve(...)` so this driver exposes the same
   * async contract as the IndexedDB one.
   */
  public storage = sessionStorage;
}
