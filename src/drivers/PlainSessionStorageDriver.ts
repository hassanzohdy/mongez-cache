import BaseCacheEngine from "./BaseCacheEngine";

export default class PlainSessionStorageDriver extends BaseCacheEngine {
  /**
   * Set the storage engine
   */
  public storage = sessionStorage;
}
