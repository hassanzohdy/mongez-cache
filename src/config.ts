import cache from "./CacheManager";
import { CacheConfigurations } from "./types";

export function setCacheConfigurations(configuration: CacheConfigurations) {
  if (configuration.driver) {
    cache.setDriver(configuration.driver);
  }

  if (configuration.prefix) {
    cache.setPrefixKey(configuration.prefix);
  }
}
