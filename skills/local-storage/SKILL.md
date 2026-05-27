---
name: mongez-cache-local-storage
description: |
  Reference for `PlainLocalStorageDriver` — `window.localStorage` backend, `{data, expiresAt}` JSON envelope, TTL behavior, corruption recovery, prefix handling, SSR caveats, and localStorage quota gotchas.
  TRIGGER when: code calls `new PlainLocalStorageDriver()` or imports `PlainLocalStorageDriver` from `@mongez/cache`; user asks "how do I persist cache across reloads", "what's the on-disk format for `@mongez/cache`", or "how do I handle the localStorage quota / SSR"; `import { PlainLocalStorageDriver } from "@mongez/cache"`.
  SKIP: tab-scoped storage — use `mongez-cache-session-storage`; in-memory ephemeral cache — use `mongez-cache-runtime`; encrypted-at-rest variant — use `mongez-cache-encryption` or `mongez-cache-encrypted-cache`; choosing among all drivers at once — use `mongez-cache-drivers`.
---

# PlainLocalStorageDriver

The default browser-side persistent driver. Reads and writes `window.localStorage`. JSON-serialized values wrapped in an envelope that carries TTL metadata.

## Signature

```ts
import { PlainLocalStorageDriver } from "@mongez/cache";

class PlainLocalStorageDriver extends BaseCacheEngine implements CacheDriverInterface {
  public storage: Storage;          // = localStorage
}
```

The driver inherits every method from `BaseCacheEngine` (`set`, `get`, `has`, `remove`, `clear`, `setPrefixKey`, etc.) — its only addition is the storage hookup.

## Usage

```ts
import { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
});

cache.set("name", "Hasan");
cache.set("user", { id: 1, name: "Hasan", roles: ["admin"] });
cache.set("letters", ["a", "b", "c"]);

cache.get("name");                  // "Hasan"
cache.get("user");                  // { id: 1, name: "Hasan", roles: ["admin"] }
cache.get("ghost", "default");      // "default"
cache.has("name");                  // true
cache.remove("name");
```

## On-disk format

Every value is wrapped in `{data, expiresAt}` before `JSON.stringify`, so the localStorage value looks like:

```json
{"data":{"id":1,"name":"Hasan"},"expiresAt":1719999999999}
```

`expiresAt` is a `Date.getTime()` timestamp; omitted when the value has no TTL. On read, the envelope is unwrapped — consumers see just the inner `data`.

## TTL

```ts
cache.set("token", "abc", 60 * 15);     // 15 minutes
```

On a read past the expiry window, the entry is removed from localStorage and the default value is returned.

## Direct use without the manager

```ts
const driver = new PlainLocalStorageDriver();
driver.setPrefixKey("scoped-");
driver.set("name", "Hasan");
driver.get("name");                 // "Hasan"
driver.remove("name");
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

- **localStorage has a ~5MB origin cap.** Writes that exceed the quota throw `QuotaExceededError`. The driver does not catch them — surface the failure or wrap in your own try/catch.
- **All values are JSON-serializable.** `Date` round-trips as a string. `Map` / `Set` / `BigInt` / class instances need a custom `valueConverter` and `valueParer`.
- **`clear()` is not prefix-scoped.** It calls `localStorage.clear()`, which wipes every entry in the origin. Use `remove(key)` per owned key on shared domains.
