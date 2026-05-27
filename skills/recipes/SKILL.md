---
name: mongez-cache-recipes
description: |
  Idiomatic composition recipes — boot-time `setCacheConfigurations`, multi-app prefix namespacing, short-TTL caches for derived data, encrypted-token storage, sibling `CacheManager` instances, SSR fallback to `RunTimeDriver`, persisting `@mongez/atom` via a `cacheAdapter`, mixing plain + encrypted adapters per atom, and wrapping the cache to emit write events.
  TRIGGER when: user asks "show me an end-to-end `@mongez/cache` example", "how do I persist `@mongez/atom` atoms with `@mongez/cache`", "how do I namespace multiple apps on one domain", "how do I subscribe to cache writes", or "how do I do SSR with `@mongez/cache`"; pull-in pattern: `import { createAtom } from "@mongez/atom"` alongside `import cache from "@mongez/cache"`.
  SKIP: bare API surface of a single function or driver — use `mongez-cache-basic-usage`, `mongez-cache-manager`, or the per-driver skills; building a brand-new driver — use `mongez-cache-custom-drivers`; first-time discovery of the package — use `mongez-cache-overview`.
---

# Recipes

Idiomatic compositions across `@mongez/cache` features and across the Mongez family.

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

cache.set("user", payload);
cache.get("user");
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
  const cached = cache.get(`recs.${productId}`);
  if (cached) return cached;

  const recs = await api.recommendations(productId);
  cache.set(`recs.${productId}`, recs, 60 * 15);   // 15 minutes
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

cache.set("auth.accessToken", token);
cache.set("auth.refreshToken", refreshToken);
```

On disk the values are AES cyphers, not plaintext. Readable only with the configured key.

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

prefs.set("theme", "dark");              // localStorage
session.set("scroll.y", 312);             // sessionStorage
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

`@mongez/atom`'s `persist` slot accepts any `PersistAdapter<V>`. The cache's API matches by name; a thin wrapper normalizes return values:

```ts
// adapters/cacheAdapter.ts
import cache from "@mongez/cache";

export const cacheAdapter = {
  get: (key: string) => cache.get(key),
  set: (key: string, value: unknown) => {
    cache.set(key, value);
  },
  remove: (key: string) => {
    cache.remove(key);
  },
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

Every `themeAtom.update("dark")` writes through to the configured backend; every page load reads back from it.

The wrapper exists so:

1. `set` and `remove` return `void` instead of the driver instance. Atom doesn't care about the chain.
2. The wrapper sits in one place — if you swap from localStorage to encrypted localStorage to IndexedDB, every atom upgrades at once.

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
  set: (k: string, v: unknown) => { plain.set(k, v); },
  remove: (k: string) => { plain.remove(k); },
};

export const encryptedAdapter = {
  get: (k: string) => encrypted.get(k),
  set: (k: string, v: unknown) => { encrypted.set(k, v); },
  remove: (k: string) => { encrypted.remove(k); },
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
  set(key: string, value: unknown, expiresAfter?: number) {
    cache.set(key, value, expiresAfter);
    events.trigger("cache.set", { key, value });
  },
  get: cache.get.bind(cache),
  remove(key: string) {
    cache.remove(key);
    events.trigger("cache.remove", { key });
  },
  on: events.on.bind(events),
};

observableCache.on("cache.set", ({ key, value }) => {
  console.log("wrote", key, value);
});
```

Or — usually simpler — route the same data through a `@mongez/atom` atom with a `persist` adapter and subscribe to the atom instead.
