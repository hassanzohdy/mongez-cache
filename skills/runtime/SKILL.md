---
name: mongez-cache-runtime
description: |
  Reference for `RunTimeDriver` — the async in-memory `Map<string, {value, expiresAt?}>` driver used for tests, SSR fallback, and ephemeral page-lifetime state, including its overridden `getItem` / `setItem` / `convertValue` / `parseValue` and the `has(missingKey)` semantics.
---

# RunTimeDriver

In-memory map. Forgets everything when the page unloads. Two instances on the same page have independent stores. Backed by a synchronous `Map` under the hood, but every public method still returns a `Promise` to satisfy the shared `CacheDriverInterface`.

## Signature

```ts
import { RunTimeDriver } from "@mongez/cache";

class RunTimeDriver extends BaseCacheEngine implements CacheDriverInterface {
  public data: Map<string, { value: any; expiresAt?: number }>;
}
```

The driver overrides `getItem` / `setItem` / `removeItem` to talk to `this.data` directly, and overrides `convertValue` / `parseValue` to no-ops since the in-memory store doesn't need JSON.

`data` is a `Map`, not a plain object: cache keys are caller-supplied, and on a plain object `__proto__` / `constructor` / `toString` resolve through the prototype chain instead of being treated as data. Reach into it with `data.get(key)` / `data.set(key, value)` / `data.delete(key)` — **it was a plain object before v1.4.0.**

## Usage

```ts
import cache, { RunTimeDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new RunTimeDriver(),
});

await cache.set("name", "Hasan");
await cache.get("name");                  // "Hasan"
// Reload — gone.
```

Or two managers, two stores:

```ts
const a = new RunTimeDriver();
const b = new RunTimeDriver();
await a.set("name", "from-a");
await b.set("name", "from-b");
await a.get("name");                      // "from-a"
await b.get("name");                      // "from-b"
```

## TTL

Works the same as the storage-backed drivers — `await cache.set(key, value, expiresAfterSeconds)`. A read past the window returns the default and drops the entry.

```ts
await cache.set("ttl.test", "abc", 60);
// ... 61 seconds later ...
await cache.get("ttl.test", null);        // null — entry has been removed
```

## SSR

This is the safe default when `localStorage` / `sessionStorage` aren't available:

```ts
const driver = typeof window === "undefined"
  ? new RunTimeDriver()
  : new PlainLocalStorageDriver();

setCacheConfigurations({ driver });
```

Server-rendered pages see an empty runtime cache (each request creates fresh state if you construct per-request), then the client takes over with its own driver on the next render.

## `has()` semantics

`has(missingKey)` resolves to `false`. `RunTimeDriver.getItem` returns `null` (not `undefined`) for misses, matching the Web Storage API contract that `BaseCacheEngine.has()` relies on (`getItem(...) !== null`), and `has()` performs the same expiry check as `get()` so the two agree on a live-vs-expired entry. Coverage lives at `src/__tests__/runtime-driver.test.ts`.
