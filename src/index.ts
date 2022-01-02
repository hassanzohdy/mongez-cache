import cache from "./CacheManager";

export * from "./types";
export * from "./config";
export { CacheManager } from "./CacheManager";
export { default as BaseCacheEngine } from "./drivers/BaseCacheEngine";
export { default as PlainLocalStorageDriver } from "./drivers/PlainLocalStorageDriver";
export { default as EncryptedLocalStorageDriver } from "./drivers/EncryptedLocalStorageDriver";

export default cache;
