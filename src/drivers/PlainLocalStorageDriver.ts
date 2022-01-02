import BaseCacheEngine from "./BaseCacheEngine";

export default class PlainLocalStorageDriver extends BaseCacheEngine {
  /**
   * Set the storage engine
   */
  public storage = localStorage;
}
