import { CacheDriverInterface } from "../types";
import BaseCacheEngine from "./BaseCacheEngine";

export default class PlainLocalStorageDriver
  extends BaseCacheEngine
  implements CacheDriverInterface
{
  /**
   * Set the storage engine
   *
   * `localStorage` is synchronous; `BaseCacheEngine` wraps every call to
   * it in `Promise.resolve(...)` so this driver exposes the same async
   * contract as the IndexedDB one. Nothing about the timing of the write
   * itself changes.
   */
  public storage = localStorage;
}
