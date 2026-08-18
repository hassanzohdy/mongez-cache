---
name: mongez-cache-manager
description: |
  Reference for the async `CacheManager` facade, the default `cache` singleton, and config helpers — `setCacheConfigurations`, `getCacheConfigurations`, `getCacheConfig`, `setDriver` / `getDriver`, `setPrefixKey`, `keys()` / `getAll()`, plus building sibling managers with distinct prefixes / backends.
---

# Cache manager

The `cache` default export is the central entry point. It's a `CacheManager` instance that forwards every call to whichever driver you install via `setCacheConfigurations`. Every storage-touching method returns a `Promise` — including on drivers that work synchronously under the hood.

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
| `await cache.set(key, value, expiresAfter?)` | Write a value. `expiresAfter` is in seconds. Resolves to the manager for chaining. |
| `await cache.get(key, defaultValue?)` | Read a value. Resolves to the default (`null` from the facade, `undefined` from a driver directly) when the key is missing or expired. |
| `await cache.has(key)` | `true` for a live (non-expired) entry. Agrees with `get()` on expiry — an expired entry is evicted and reported absent. |
| `await cache.remove(key)` | Delete a single entry. Resolves to the manager. |
| `await cache.keys()` | List the caller-facing keys owned by the active driver, prefix stripped. |
| `await cache.getAll()` | Read every live entry as a single `{ key: value }` object, null-prototype, prefix stripped. |
| `await cache.clear()` | Wipe the cache. **Prefix-scoped since v1.4.0** — only keys carrying the configured prefix are removed. With no prefix configured, the whole backing storage is wiped. |
| `cache.setPrefixKey(p)` / `cache.getPrefixKey()` | Namespace control. Synchronous. |
| `cache.setValueConverter(fn)` / `cache.setValueParser(fn)` | Override the default `JSON.stringify` / `JSON.parse` per driver. Synchronous. |
| `cache.setDriver(driver)` / `cache.getDriver()` | Hot-swap the underlying backend at runtime. Synchronous. |

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

`getCacheConfig` is generic over `keyof CacheConfigurations`, so the return type narrows to match the key you pass instead of widening to a union of every config value's type.

## Bulk operations — `keys()` and `getAll()`

```ts
await cache.set("user.name", "Hasan");
await cache.set("user.email", "hasan@example.com");

await cache.keys();   // ["user.name", "user.email"]
await cache.getAll(); // { "user.name": "Hasan", "user.email": "hasan@example.com" }
```

Both skip expired entries and are scoped to the configured prefix (with the prefix stripped from the returned keys). `getAll()`'s result is a null-prototype object where a stored `__proto__` / `constructor` / `prototype` key is defined via `Object.defineProperty` rather than bracket assignment — cache keys can be written by anything sharing the origin, so this guards against prototype pollution on the one place a stored key becomes an object property again.

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

await preferences.set("theme", "dark");    // localStorage
await session.set("scroll.y", 312);         // sessionStorage
```

`setCacheConfigurations` only touches the default `cache`. The two custom managers above don't reach for the global configuration record.

## TTL — per call or global

Per call:

```ts
await cache.set("token", "abc", 60 * 15);     // expires in 15 minutes
```

Global default (used when `set` omits the per-call value):

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  expiresAfter: 60 * 60,                // 1 hour for everything
});

await cache.set("user", payload);             // uses 1 hour
await cache.set("session", value, 60);        // overrides to 60 seconds
```

Reads past the expiry window return the default value and drop the entry from storage.

## Prefix

Single-app deployments rarely need a prefix. Multi-app, single-domain deployments absolutely do — otherwise `cache.get("user")` in app A picks up app B's user. Set once at boot:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",
});

await cache.set("user", { id: 1 });
// On disk: { "shop-user": "{...}" }
await cache.get("user");        // reads through the bare key
```

Prefixes are not enforced — overlapping prefixes share storage. Pick a stable string per app.

## Gotchas

- **Every storage-touching method returns a `Promise`.** `set` / `get` / `has` / `remove` / `clear` / `keys` / `getAll` — `await` all of them, even on `PlainLocalStorageDriver` and `RunTimeDriver`, which resolve immediately under the hood.
- **`cache.clear()` is scoped to your prefix** (since v1.4.0). Only keys starting with the configured prefix are removed, so apps sharing an origin don't wipe each other's data. **With no prefix configured it still clears the whole backend** — set a prefix if you share a domain.
- **`get` resolves to `null` from the manager, `undefined` from a driver directly.** The facade defaults to `null` (`get(key, defaultValue = null)`); drivers default to `undefined`. Specify your own default when you care.
- **The configuration singleton is module-level.** Tests that mutate it bleed into each other unless you re-apply a known baseline in `beforeEach`.
