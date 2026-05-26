---
name: mongez-cache-basic-usage
description: |
  Using the `cache` singleton — `set`, `get`, `remove`, `clear`, `has`, per-call/global TTL, key prefixing, and the `@mongez/atom` `persist` adapter pattern.
  TRIGGER when: code calls `cache.set`, `cache.get`, `cache.has`, `cache.remove`, `cache.clear`, `getCacheConfigurations`, or `getCacheConfig` from `@mongez/cache`; user asks "how do I write/read/expire/remove a cache entry" or "how do I wire `@mongez/cache` into `@mongez/atom`'s `persist` slot"; `import cache, { setCacheConfigurations } from "@mongez/cache"`.
  SKIP: configuring or swapping drivers themselves — use `mongez-cache-drivers` or `mongez-cache-manager`; encrypted at-rest reads/writes — use `mongez-cache-encrypted-cache` or `mongez-cache-encryption`; building a custom backend — use `mongez-cache-custom-drivers`.
---

# @mongez/cache — Basic Usage

## When to use

Use this skill when someone needs to:

- Write, read, remove, or clear cache entries.
- Pass a per-call TTL or rely on a global default TTL.
- Check whether a key exists with `cache.has(...)`.
- Understand how key prefixing affects stored keys vs. lookup keys.
- Wire the cache into `@mongez/atom`'s `persist` slot.

## How to use

### Prerequisites

The driver must be configured before any cache call. See the `drivers` skill for the full bootstrap. Minimal example:

```ts
import cache, { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
```

### set

```ts
cache.set(key: string, value: any, expiresAfter?: number): CacheManager
```

- `key` — bare string; prefix (if configured) is prepended automatically.
- `value` — any JSON-serializable type: string, number, boolean, array, plain object.
- `expiresAfter` — optional TTL **in seconds**. Overrides any global `expiresAfter` from config. Omit for no expiry (or to fall back to the global default).

```ts
cache.set("user", { id: 1, name: "Hasan" });
cache.set("letters", ["a", "b", "c"]);
cache.set("token", "abc123", 60 * 15);   // expires in 15 minutes
cache.set("session", value, 0);          // 0 = no expiry (falsy disables TTL)
```

Returns `this` (chainable), though chaining is rarely needed.

### get

```ts
cache.get(key: string, defaultValue?: any): any
```

- Returns the stored value, or `defaultValue` (defaults to `null`) when the key does not exist or has expired.
- Expired entries are deleted from storage on read and the default value is returned.

```ts
cache.get("user");              // { id: 1, name: "Hasan" }
cache.get("ghost");             // null
cache.get("ghost", "fallback"); // "fallback"
```

### has

```ts
cache.has(key: string): boolean
```

Returns `true` if the raw storage entry exists (note: does **not** check expiry — the expiry check happens in `get`). Use `get(key) !== null` when you need a definitive existence-and-not-expired check.

```ts
cache.has("user");  // true
cache.has("ghost"); // false
```

### remove

```ts
cache.remove(key: string): CacheManager
```

Deletes a single key from storage.

```ts
cache.remove("token");
```

### clear

```ts
cache.clear(): CacheManager
```

Wipes **the entire** backing store. For `PlainLocalStorageDriver` this calls `localStorage.clear()` — all keys, including those not managed by this package, are removed. Use with care in multi-library setups.

```ts
cache.clear();
```

### Per-call TTL vs. global default TTL

```ts
// Global default: every write that omits a TTL expires in 1 hour
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  expiresAfter: 60 * 60,
});

cache.set("user", payload);          // expires in 1 hour (global default)
cache.set("refresh", token, 60 * 5); // expires in 5 minutes (overrides global)
cache.set("static", data, 0);        // no expiry (0 is falsy — disables TTL for this entry)
```

### Key prefixing

Prefix is prepended to the raw storage key automatically. You always work with the bare key:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",
});

cache.set("user", { id: 1 });
// Stored in localStorage as: "shop-user"

cache.get("user");    // reads "shop-user" — prefix handled internally
cache.remove("user"); // deletes "shop-user"
```

Prefixes prevent key collisions between apps sharing the same domain.

### Wiring to @mongez/atom persist slot

`@mongez/atom` accepts a `persist` adapter that must implement `{ get, set, remove }`. The cache manager's shape is compatible with a thin wrapper (wrapper exists because `set` on the driver returns `this`, but atoms expect `void`):

```ts
import { createAtom } from "@mongez/atom";
import cache from "@mongez/cache";

const userAtom = createAtom({
  key: "auth.user",
  default: { name: "Anon" },
  persist: {
    get:    (key) => cache.get(key),
    set:    (key, value) => { cache.set(key, value); },
    remove: (key) => { cache.remove(key); },
  },
});
```

For a shared adapter used across many atoms, extract it to a module:

```ts
// adapters/cacheAdapter.ts
import cache from "@mongez/cache";

export const cacheAdapter = {
  get:    (key: string) => cache.get(key),
  set:    (key: string, value: unknown) => { cache.set(key, value); },
  remove: (key: string) => { cache.remove(key); },
};
```

```ts
import { cacheAdapter } from "./adapters/cacheAdapter";

const themeAtom = createAtom({ key: "ui.theme", default: "light", persist: cacheAdapter });
const langAtom  = createAtom({ key: "ui.lang",  default: "en",    persist: cacheAdapter });
```

### Reading config at runtime

```ts
import { getCacheConfigurations, getCacheConfig } from "@mongez/cache";

getCacheConfigurations();             // full CacheConfigurations object
getCacheConfig("expiresAfter");       // e.g. 3600
getCacheConfig("prefix");             // e.g. "shop-"
```

## Key details / Pitfalls

- **`get` returns `null` (not `undefined`) as the default.** Pass an explicit second argument when you need a different sentinel value.
- **Expired entries are cleaned up lazily on `get`.** `has` does not check expiry. A key can return `true` from `has` but return the default value from `get` when the entry has expired.
- **`clear()` wipes the entire storage backend.** For `PlainLocalStorageDriver`, this includes keys written by other libraries or browser extensions stored in `localStorage`. Prefer `remove` for targeted cleanup.
- **TTL `0` disables expiry** for that entry (falsy check). Use `expiresAfter: 1` as the minimum if you want a near-immediate expiry.
- **Values must survive JSON round-trips.** `Map`, `Set`, `Date`, `BigInt`, class instances, and circular references will not survive the default serializer. Use a custom `valueConverter`/`valueParer` or serialize before storing.
- **The `set` return value is chainable but the chain type is `any`.** TypeScript will not catch method calls after `cache.set(...)` in a chain. Prefer standalone statements.
