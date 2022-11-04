import cache from "./CacheManager";
import { CacheConfigurations } from "./types";

let configuration: Partial<CacheConfigurations> = {};

export function setCacheConfigurations(newConfiguration: CacheConfigurations) {
  if (configuration.driver) {
    cache.setDriver(configuration.driver);
  }

  if (configuration.prefix) {
    cache.setPrefixKey(configuration.prefix);
  }

  configuration = { ...configuration, ...newConfiguration };
}

export function getCacheConfigurations() {
  return configuration;
}

export function getCacheConfig(key: keyof CacheConfigurations) {
  return configuration[key];
}
