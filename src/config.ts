import cache from "./CacheManager";
import { CacheConfigurations } from "./types";

let configuration: Partial<CacheConfigurations> = {};

export function setCacheConfigurations(newConfiguration: CacheConfigurations) {
  if (newConfiguration.driver) {
    cache.setDriver(newConfiguration.driver);
  }

  if (newConfiguration.prefix) {
    cache.setPrefixKey(newConfiguration.prefix);
  }

  configuration = { ...configuration, ...newConfiguration };
}

export function getCacheConfigurations() {
  return configuration;
}

export function getCacheConfig(key: keyof CacheConfigurations) {
  return configuration[key];
}
