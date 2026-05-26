---
name: mongez-cache-runtime
description: |
  Reference for `RunTimeDriver` — the in-memory `Record<string, {value, expiresAt?}>` driver used for tests, SSR fallback, and ephemeral page-lifetime state, including its overridden `getItem` / `setItem` / `convertValue` / `parseValue` and the known `has(missingKey) === true` bug.
  TRIGGER when: code calls `new RunTimeDriver()` or imports `RunTimeDriver` from `@mongez/cache`; user asks "how do I get an in-memory cache for tests", "how do I make cache SSR-safe in Node", or "why does `has()` return `true` for missing keys"; `import { RunTimeDriver } from "@mongez/cache"`.
  SKIP: localStorage-backed persistence — use `mongez-cache-local-storage`; tab-scoped storage — use `mongez-cache-session-storage`; encrypted drivers — use `mongez-cache-encryption`; building a brand-new backend — use `mongez-cache-custom-drivers`.
---

# RunTimeDriver

In-memory map. Forgets everything when the page unloads. Two instances on the same page have independent stores.

## Signature

```ts
import { RunTimeDriver } from "@mongez/cache";

class RunTimeDriver extends BaseCacheEngine implements CacheDriverInterface {
  public data: Record<string, { value: any; expiresAt?: number }>;
}
```

The driver overrides `getItem` / `setItem` / `removeItem` to talk to `this.data` directly, and overrides `convertValue` / `parseValue` to no-ops since the in-memory store doesn't need JSON.

## When to use it

- **Tests**: deterministic, isolated, no browser globals required, no cleanup between tests.
- **SSR fallback**: when the same code path runs on server and client, switch to the runtime driver on the server so calls don't throw.
- **Ephemeral state**: caches that should die with the page (search-suggestion cache, derived-value memos, etc).

For state that survives a reload, use [`PlainLocalStorageDriver`](./local-storage.md). For tab-scoped state that survives a refresh, use [`PlainSessionStorageDriver`](./session-storage.md).

## Usage

```ts
import { RunTimeDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new RunTimeDriver(),
});

cache.set("name", "Hasan");
cache.get("name");                  // "Hasan"
// Reload — gone.
```

Or two managers, two stores:

```ts
const a = new RunTimeDriver();
const b = new RunTimeDriver();
a.set("name", "from-a");
b.set("name", "from-b");
a.get("name");                      // "from-a"
b.get("name");                      // "from-b"
```

## TTL

Works the same as the storage-backed drivers — `cache.set(key, value, expiresAfterSeconds)`. A read past the window returns the default and drops the entry.

```ts
cache.set("ttl.test", "abc", 60);
// ... 61 seconds later ...
cache.get("ttl.test", null);        // null — entry has been removed
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

`has(missingKey)` returns `false`. `RunTimeDriver.getItem` returns `null` (not `undefined`) for misses, matching the Web Storage API contract that `BaseCacheEngine.has()` relies on (`getItem(...) !== null`). Coverage lives at `src/__tests__/runtime-driver.test.ts`.
