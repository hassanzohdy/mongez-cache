---
name: mongez-cache-manager
description: |
  Reference for the `CacheManager` facade, the default `cache` singleton, and config helpers — `setCacheConfigurations`, `getCacheConfigurations`, `getCacheConfig`, `setDriver` / `getDriver`, `setPrefixKey`, plus building sibling managers with distinct prefixes / backends.
  TRIGGER when: code imports `cache` (default), `CacheManager`, `setCacheConfigurations`, `getCacheConfigurations`, or `getCacheConfig` from `@mongez/cache`; user asks "how do I bootstrap `@mongez/cache`", "how do I hot-swap the driver", or "how do I have two cache managers side by side"; `import cache, { CacheManager } from "@mongez/cache"`.
  SKIP: per-driver options (`PlainLocalStorageDriver` etc.) — use `mongez-cache-drivers`; daily `cache.set` / `cache.get` / `cache.has` calls — use `mongez-cache-basic-usage`; encrypted setup — use `mongez-cache-encryption` / `mongez-cache-encrypted-cache`; building a custom backend — use `mongez-cache-custom-drivers`.
---

# Cache manager

The `cache` default export is the central entry point. It's a `CacheManager` instance that forwards every call to whichever driver you install via `setCacheConfigurations`.

## Signature

```ts
import cache from "@mongez/cache";

interface CacheManagerInterface extends CacheDriverInterface {
  setDriver(driver: CacheDriverInterface): void;
  getDriver(): CacheDriverInterface;
}
```

## Methods

| Method | Description |
|---|---|
| `cache.set(key, value, expiresAfter?)` | Write a value. `expiresAfter` is in seconds. Returns the manager for chaining. |
| `cache.get(key, defaultValue?)` | Read a value. Returns the default (or `null` from the facade, `undefined` from a driver directly) when the key is missing. |
| `cache.has(key)` | `true` when the raw storage entry exists. Does **not** check expiry — use `get(key) !== null` for that. |
| `cache.remove(key)` | Delete a single entry. Returns the manager. |
| `cache.clear()` | Wipe the entire backing storage. **Not prefix-scoped** — `localStorage.clear()` resets every key in the origin. |
| `cache.setPrefixKey(p)` / `cache.getPrefixKey()` | Namespace control. |
| `cache.setValueConverter(fn)` / `cache.setValueParser(fn)` | Override the default `JSON.stringify` / `JSON.parse` per driver. |
| `cache.setDriver(driver)` / `cache.getDriver()` | Hot-swap the underlying backend at runtime. |

## Bootstrap

```ts
import { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "myapp-",
  expiresAfter: 60 * 60,        // 1 hour default for every entry
});
```

`setCacheConfigurations`:
- Installs the driver on the default `cache`.
- Applies prefix / value-converter / value-parser to that driver.
- Stores the rest in a module-level singleton so `getCacheConfig("expiresAfter")` returns it later.

Call it once at boot. Calling it again merges new fields into the existing record.

## Reading configuration back

```ts
import { getCacheConfigurations, getCacheConfig } from "@mongez/cache";

getCacheConfigurations();              // Partial<CacheConfigurations>
getCacheConfig("expiresAfter");        // 3600
getCacheConfig("prefix");              // "myapp-"
```

## Multiple managers

The shipped `cache` is a singleton for the typical "one cache per app" pattern. Build a second when you have sibling concerns with different backends / prefixes:

```ts
import {
  CacheManager,
  PlainLocalStorageDriver,
  PlainSessionStorageDriver,
} from "@mongez/cache";

const preferences = new CacheManager();
preferences
  .setDriver(new PlainLocalStorageDriver())
  .setPrefixKey("pref-");

const session = new CacheManager();
session
  .setDriver(new PlainSessionStorageDriver())
  .setPrefixKey("session-");

preferences.set("theme", "dark");           // localStorage
session.set("scroll.y", 312);                // sessionStorage
```

`setCacheConfigurations` only touches the default `cache`. The two custom managers above don't reach for the global configuration record.

## TTL — per call or global

Per call:

```ts
cache.set("token", "abc", 60 * 15);     // expires in 15 minutes
```

Global default (used when `set` omits the per-call value):

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  expiresAfter: 60 * 60,                // 1 hour for everything
});

cache.set("user", payload);             // uses 1 hour
cache.set("session", value, 60);        // overrides to 60 seconds
```

Reads past the expiry window return the default value and drop the entry from storage.

## Prefix

Single-app deployments rarely need a prefix. Multi-app, single-domain deployments absolutely do — otherwise `cache.get("user")` in app A picks up app B's user. Set once at boot:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",
});

cache.set("user", { id: 1 });
// On disk: { "shop-user": "{...}" }
cache.get("user");        // reads through the bare key
```

Prefixes are not enforced — overlapping prefixes share storage. Pick a stable string per app.

## Gotchas

- **`cache.clear()` is global to the backend.** `localStorage.clear()` wipes everything in the origin, not just the keys under your prefix. If multiple apps share a domain, use `cache.remove(key)` for owned keys instead.
- **`get` returns `null` from the manager, `undefined` from a driver directly.** The facade defaults to `null` (`get(key, defaultValue = null)`); drivers default to `undefined`. Specify your own default when you care.
- **The configuration singleton is module-level.** Tests that mutate it bleed into each other unless you re-apply a known baseline in `beforeEach`.
