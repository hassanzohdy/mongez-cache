import cache from "./CacheManager";
export { CacheManager } from "./CacheManager";
export * from "./config";
export { default as BaseCacheEngine } from "./drivers/BaseCacheEngine";
export { default as EncryptedLocalStorageDriver } from "./drivers/EncryptedLocalStorageDriver";
export { default as EncryptedSessionStorageDriver } from "./drivers/EncryptedSessionStorageDriver";
export { default as PlainLocalStorageDriver } from "./drivers/PlainLocalStorageDriver";
export { default as PlainSessionStorageDriver } from "./drivers/PlainSessionStorageDriver";
export { default as RunTimeDriver } from "./drivers/RunTimeDriver";
export * from "./types";

export default cache;
