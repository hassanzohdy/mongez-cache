---
name: mongez-cache-local-storage
description: |
  Reference for `PlainLocalStorageDriver` — `window.localStorage` backend, async `{data, expiresAt}` JSON envelope, TTL behavior, corruption recovery, prefix-scoped `clear()`, SSR caveats, and localStorage quota gotchas.
---

# PlainLocalStorageDriver

The default browser-side persistent driver. Reads and writes `window.localStorage`. JSON-serialized values wrapped in an envelope that carries TTL metadata. The underlying work is synchronous, but every public method still returns a `Promise` to satisfy the shared `CacheDriverInterface`.

## Signature

```ts
import { PlainLocalStorageDriver } from "@mongez/cache";

class PlainLocalStorageDriver extends BaseCacheEngine implements CacheDriverInterface {
  public storage: Storage;          // = localStorage
}
```

The driver inherits every method from `BaseCacheEngine` (`set`, `get`, `has`, `remove`, `clear`, `keys`, `getAll`, `setPrefixKey`, etc.) — its only addition is the storage hookup.

## Usage

```ts
import cache, { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
});

await cache.set("name", "Hasan");
await cache.set("user", { id: 1, name: "Hasan", roles: ["admin"] });
await cache.set("letters", ["a", "b", "c"]);

await cache.get("name");                  // "Hasan"
await cache.get("user");                  // { id: 1, name: "Hasan", roles: ["admin"] }
await cache.get("ghost", "default");      // "default"
await cache.has("name");                  // true
await cache.remove("name");
```

## On-disk format

Every value is wrapped in `{data, expiresAt}` before `JSON.stringify`, so the localStorage value looks like:

```json
{"data":{"id":1,"name":"Hasan"},"expiresAt":1719999999999}
```

`expiresAt` is a `Date.getTime()` timestamp; omitted when the value has no TTL. On read, the envelope is unwrapped — consumers see just the inner `data`.

## TTL

```ts
await cache.set("token", "abc", 60 * 15);     // 15 minutes
```

On a read past the expiry window, the entry is removed from localStorage and the default value is returned. `has()` performs the same expiry check and evicts, so it agrees with `get()`.

## Direct use without the manager

```ts
const driver = new PlainLocalStorageDriver();
driver.setPrefixKey("scoped-");
await driver.set("name", "Hasan");
await driver.get("name");                 // "Hasan"
await driver.remove("name");
```

Useful when you need a second store with a different prefix without going through `setCacheConfigurations`.

## Corruption recovery

If localStorage contains a value that doesn't parse as the expected envelope (manual tampering, schema drift, partial write), the driver removes the malformed entry and returns the default value silently. Subsequent reads see a clean miss.

## SSR

`localStorage` doesn't exist on the server. Instantiating `new PlainLocalStorageDriver()` in a Node process where `localStorage` isn't globally provided will throw `ReferenceError: localStorage is not defined`. Gate the construction:

```ts
const driver = typeof localStorage !== "undefined"
  ? new PlainLocalStorageDriver()
  : new RunTimeDriver();
```

Or use a cookie-backed custom driver on the server.

## Gotchas

- **localStorage has a ~5MB origin cap.** Writes that exceed the quota throw `QuotaExceededError`. The driver does not catch it — surface the failure or wrap in your own try/catch. (`IndexedDBDriver` wraps its own quota errors into `CacheQuotaExceededError`; this driver does not.)
- **All values are JSON-serializable.** `Date` round-trips as a string. `Map` / `Set` / `BigInt` / class instances need a custom `valueConverter` and `valueParer`, or reach for `IndexedDBDriver`, which uses structured clone instead.
- **`clear()` is scoped to the configured prefix** (since v1.4.0). With a prefix set, only owned keys are removed. With no prefix configured, it calls `localStorage.clear()`, wiping every entry in the origin — set a prefix on shared domains.
- **Every method returns a `Promise`.** The work happens synchronously under the hood, but `await` is still required as of 2.0.0.
