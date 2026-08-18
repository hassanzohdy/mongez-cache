---
name: mongez-cache-recipes
description: |
  Idiomatic composition recipes — boot-time `setCacheConfigurations`, multi-app prefix namespacing, short-TTL caches for derived data, encrypted-token storage, opt-in IndexedDB for structured/large values, sibling `CacheManager` instances, SSR fallback to `RunTimeDriver`, persisting `@mongez/atom` via a `cacheAdapter`, mixing plain + encrypted adapters per atom, and wrapping the cache to emit write events. Every call site awaits the cache methods.
---

# Recipes

Idiomatic compositions across `@mongez/cache` features and across the Mongez family. Every `cache.*` call returns a `Promise` as of 2.0.0.

## Bootstrap once at app entry

```ts
// src/bootstrap.ts
import {
  PlainLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: `${import.meta.env.VITE_APP_KEY}-`,
  expiresAfter: 60 * 60 * 24,           // 1 day default
});
```

Then everywhere else:

```ts
import cache from "@mongez/cache";

await cache.set("user", payload);
await cache.get("user");
```

## Multi-app namespacing on the same domain

```ts
// in app A
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "app-a-",
});

// in app B
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "app-b-",
});
```

Each app sees its own `user`, `token`, `prefs.theme`, etc. without leaking into the other.

## TTL — keeping a short cache for derived data

```ts
async function getProductRecommendations(productId: string) {
  const cached = await cache.get(`recs.${productId}`);
  if (cached) return cached;

  const recs = await api.recommendations(productId);
  await cache.set(`recs.${productId}`, recs, 60 * 15);   // 15 minutes
  return recs;
}
```

The recommendations are recomputed at most every 15 minutes per product, surviving reloads but not stale forever.

## Encrypted tokens

```ts
import { encrypt, decrypt, setEncryptionConfigurations } from "@mongez/encryption";
import {
  EncryptedLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

setEncryptionConfigurations({ key: import.meta.env.VITE_APP_SECRET });

setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: { encrypt, decrypt },
});

await cache.set("auth.accessToken", token);
await cache.set("auth.refreshToken", refreshToken);
```

On disk the values are AES-GCM cyphers, not plaintext. Readable only with the configured key.

## Structured or large values via IndexedDB (opt-in)

Reach for `IndexedDBDriver` when a value needs to survive as a real `Date` / `Map` / `Set`, or is too big for Web Storage's ~5MB quota:

```ts
import cache, { IndexedDBDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new IndexedDBDriver() });

await cache.set("report.rows", hugeRowArray);
await cache.set("report.generatedAt", new Date());

const generatedAt = await cache.get("report.generatedAt"); // a real Date instance
```

Combine with encryption for large sensitive payloads via `EncryptedIndexedDBDriver` — see the `indexeddb` and `encrypted-cache` skills.

## Sibling stores — long-lived prefs + ephemeral session

```ts
import {
  CacheManager,
  PlainLocalStorageDriver,
  PlainSessionStorageDriver,
} from "@mongez/cache";

export const prefs = new CacheManager();
prefs
  .setDriver(new PlainLocalStorageDriver())
  .setPrefixKey("pref-");

export const session = new CacheManager();
session
  .setDriver(new PlainSessionStorageDriver())
  .setPrefixKey("session-");

await prefs.set("theme", "dark");         // localStorage
await session.set("scroll.y", 312);        // sessionStorage
```

Two managers, two prefixes, two backends — explicit at every call site.

## SSR fallback to runtime driver

```ts
import {
  PlainLocalStorageDriver,
  RunTimeDriver,
  setCacheConfigurations,
} from "@mongez/cache";

const driver = typeof window === "undefined"
  ? new RunTimeDriver()
  : new PlainLocalStorageDriver();

setCacheConfigurations({ driver });
```

Same call sites work on server and client. The server sees an empty in-memory cache (fresh per request if you re-bootstrap per request) and the client takes over with persistent storage on hydration.

## Persisting an atom via `@mongez/cache`

`@mongez/atom`'s `persist` slot accepts an async `PersistAdapter<V>`, which is exactly the cache's `{ get, set, remove }` shape:

```ts
// adapters/cacheAdapter.ts
import cache from "@mongez/cache";

export const cacheAdapter = {
  get: (key: string) => cache.get(key),
  set: (key: string, value: unknown) => cache.set(key, value),
  remove: (key: string) => cache.remove(key),
};
```

Then:

```ts
import { createAtom } from "@mongez/atom";
import { cacheAdapter } from "./adapters/cacheAdapter";

const themeAtom = createAtom({
  key: "ui.theme",
  default: "light",
  persist: cacheAdapter,
});

const userAtom = createAtom({
  key: "auth.user",
  default: { name: "Anon" },
  persist: cacheAdapter,
});
```

Every `themeAtom.update("dark")` writes through to the configured backend; every page load reads back from it. Swap the cache's driver from plain to encrypted to IndexedDB, and every atom using this adapter upgrades at once with zero call-site changes.

## Per-atom backend (mixing persistence strategies)

If different atoms want different backends, build one adapter per backend:

```ts
import {
  CacheManager,
  PlainLocalStorageDriver,
  EncryptedLocalStorageDriver,
} from "@mongez/cache";

const plain = new CacheManager();
plain.setDriver(new PlainLocalStorageDriver()).setPrefixKey("app-");

const encrypted = new CacheManager();
encrypted.setDriver(new EncryptedLocalStorageDriver()).setPrefixKey("secure-");

export const plainAdapter = {
  get: (k: string) => plain.get(k),
  set: (k: string, v: unknown) => plain.set(k, v),
  remove: (k: string) => plain.remove(k),
};

export const encryptedAdapter = {
  get: (k: string) => encrypted.get(k),
  set: (k: string, v: unknown) => encrypted.set(k, v),
  remove: (k: string) => encrypted.remove(k),
};

// atoms/preferences.ts
const themeAtom = createAtom({
  key: "ui.theme",
  default: "light",
  persist: plainAdapter,
});

// atoms/auth.ts
const tokenAtom = createAtom({
  key: "auth.token",
  default: "",
  persist: encryptedAdapter,
});
```

The token sits encrypted on disk; the theme sits plain. The atom code doesn't know the difference.

## Subscribe to cache writes (custom)

`@mongez/cache` doesn't emit events. If you need write-through subscriptions, wrap the cache:

```ts
import events from "@mongez/events";
import cache from "@mongez/cache";

export const observableCache = {
  async set(key: string, value: unknown, expiresAfter?: number) {
    await cache.set(key, value, expiresAfter);
    events.trigger("cache.set", { key, value });
  },
  get: cache.get.bind(cache),
  async remove(key: string) {
    await cache.remove(key);
    events.trigger("cache.remove", { key });
  },
  on: events.on.bind(events),
};

observableCache.on("cache.set", ({ key, value }) => {
  console.log("wrote", key, value);
});
```

Or — usually simpler — route the same data through a `@mongez/atom` atom with a `persist` adapter and subscribe to the atom instead.

## Snapshotting the whole cache with `getAll()`

Useful for a debug panel, a "download my data" export, or seeding a second store:

```ts
const snapshot = await cache.getAll(); // { key: value, ... } — every live entry

// Re-hydrate into a different driver:
const target = new CacheManager();
target.setDriver(new RunTimeDriver());

for (const [key, value] of Object.entries(snapshot)) {
  await target.set(key, value);
}
```
