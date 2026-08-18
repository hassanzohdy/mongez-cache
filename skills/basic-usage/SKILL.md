---
name: mongez-cache-basic-usage
description: |
  Using the `cache` singleton — async `set`, `get`, `remove`, `clear`, `has`, `keys`, `getAll`, per-call/global TTL, key prefixing, and the `@mongez/atom` `persist` adapter pattern.
---

# @mongez/cache — Basic Usage

## How to use

### Prerequisites

The driver must be configured before any cache call. See the `drivers` skill for the full bootstrap. Minimal example:

```ts
import cache, { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
```

### set

```ts
cache.set(key: string, value: any, expiresAfter?: number): Promise<CacheManager>
```

- `key` — bare string; prefix (if configured) is prepended automatically.
- `value` — any JSON-serializable type: string, number, boolean, array, plain object.
- `expiresAfter` — optional TTL **in seconds**. Overrides any global `expiresAfter` from config. Omit for no expiry (or to fall back to the global default).

```ts
await cache.set("user", { id: 1, name: "Hasan" });
await cache.set("letters", ["a", "b", "c"]);
await cache.set("token", "abc123", 60 * 15);   // expires in 15 minutes
await cache.set("session", value, 0);          // 0 = no expiry (falsy disables TTL)
```

Resolves to `this` (chainable), though chaining is rarely needed.

### get

```ts
cache.get(key: string, defaultValue?: any): Promise<any>
```

- Resolves to the stored value, or `defaultValue` (defaults to `null`) when the key does not exist or has expired.
- Expired entries are deleted from storage on read and the default value is returned.

```ts
await cache.get("user");              // { id: 1, name: "Hasan" }
await cache.get("ghost");             // null
await cache.get("ghost", "fallback"); // "fallback"
```

### has

```ts
cache.has(key: string): Promise<boolean>
```

Resolves to `true` for a live (non-expired) entry. As of 2.0.0, `has()` agrees with `get()` on expiry — an expired entry is evicted and reported absent, rather than reported present only for `get()` to make it disappear on the next call.

```ts
await cache.has("user");  // true
await cache.has("ghost"); // false
```

### remove

```ts
cache.remove(key: string): Promise<CacheManager>
```

Deletes a single key from storage.

```ts
await cache.remove("token");
```

### keys

```ts
cache.keys(): Promise<string[]>
```

Lists the caller-facing keys owned by the active driver — the configured prefix is stripped, so what comes back can be fed straight into `get()` / `remove()`.

```ts
await cache.keys(); // ["user", "token"]
```

### getAll

```ts
cache.getAll(): Promise<Record<string, any>>
```

Reads every live (non-expired) entry owned by the driver as one object, keyed the same way as `keys()`.

```ts
await cache.getAll(); // { user: { id: 1, name: "Hasan" }, token: "abc123" }
```

The result has a null prototype and defines forbidden keys (`__proto__`, `constructor`, `prototype`) via `Object.defineProperty` rather than bracket assignment — a stored key of one of those names lands as inert data instead of reaching a prototype setter.

### clear

```ts
cache.clear(): Promise<CacheManager>
```

Wipes the backing store. **Prefix-scoped when a prefix is configured** — only keys carrying it are removed. With no prefix configured, the driver owns the whole namespace and `clear()` wipes it entirely (for `PlainLocalStorageDriver` this means `localStorage.clear()`, including keys not managed by this package).

```ts
await cache.clear();
```

### Per-call TTL vs. global default TTL

```ts
// Global default: every write that omits a TTL expires in 1 hour
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  expiresAfter: 60 * 60,
});

await cache.set("user", payload);          // expires in 1 hour (global default)
await cache.set("refresh", token, 60 * 5); // expires in 5 minutes (overrides global)
await cache.set("static", data, 0);        // no expiry (0 is falsy — disables TTL for this entry)
```

### Key prefixing

Prefix is prepended to the raw storage key automatically. You always work with the bare key:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",
});

await cache.set("user", { id: 1 });
// Stored in localStorage as: "shop-user"

await cache.get("user");    // reads "shop-user" — prefix handled internally
await cache.remove("user"); // deletes "shop-user"
```

Prefixes prevent key collisions between apps sharing the same domain.

### Wiring to @mongez/atom persist slot

`@mongez/atom` accepts a `persist` adapter that must implement an async `{ get, set, remove }`. The cache manager's methods already return promises, so they can be passed straight through:

```ts
import { createAtom } from "@mongez/atom";
import cache from "@mongez/cache";

const userAtom = createAtom({
  key: "auth.user",
  default: { name: "Anon" },
  persist: {
    get:    (key) => cache.get(key),
    set:    (key, value) => cache.set(key, value),
    remove: (key) => cache.remove(key),
  },
});
```

For a shared adapter used across many atoms, extract it to a module:

```ts
// adapters/cacheAdapter.ts
import cache from "@mongez/cache";

export const cacheAdapter = {
  get:    (key: string) => cache.get(key),
  set:    (key: string, value: unknown) => cache.set(key, value),
  remove: (key: string) => cache.remove(key),
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

- **Every storage-touching method returns a `Promise`.** `set` / `get` / `has` / `remove` / `clear` / `keys` / `getAll` — `await` all of them, on every driver, including the ones that run synchronously under the hood.
- **`get` resolves to `null` (not `undefined`) as the default.** Pass an explicit second argument when you need a different sentinel value.
- **Expired entries are cleaned up lazily on `get`, and `has` now agrees.** A key that has expired reports `false` from `has()` and returns the default from `get()` — no more window where they disagree.
- **`clear()` is scoped to the configured prefix; with no prefix it wipes the entire storage backend.** For `PlainLocalStorageDriver` with no prefix, this includes keys written by other libraries or browser extensions stored in `localStorage`. Prefer `remove` for targeted cleanup, or set a `prefix`.
- **TTL `0` disables expiry** for that entry (falsy check). Use `expiresAfter: 1` as the minimum if you want a near-immediate expiry.
- **Values must survive JSON round-trips on the non-IndexedDB drivers.** `Map`, `Set`, `Date`, `BigInt`, class instances, and circular references will not survive the default serializer on `PlainLocalStorageDriver` / `PlainSessionStorageDriver` / `RunTimeDriver`. Use a custom `valueConverter`/`valueParer`, serialize before storing, or reach for `IndexedDBDriver`, which uses structured clone instead of JSON.
