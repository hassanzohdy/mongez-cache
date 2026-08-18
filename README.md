<div align="center">

# @mongez/cache

**Framework-agnostic async cache facade with pluggable drivers — one API for localStorage, sessionStorage, IndexedDB, in-memory, and encrypted variants.**

[![npm](https://img.shields.io/npm/v/@mongez/cache.svg)](https://www.npmjs.com/package/@mongez/cache)
[![license](https://img.shields.io/npm/l/@mongez/cache.svg)](LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@mongez/cache.svg)](https://bundlephobia.com/package/@mongez/cache)
[![downloads](https://img.shields.io/npm/dw/@mongez/cache.svg)](https://www.npmjs.com/package/@mongez/cache)

</div>

---

## Why @mongez/cache?

`localStorage`, `sessionStorage`, in-memory maps, and IndexedDB all solve similar problems with different APIs and lifetimes. `localforage` unifies them but is tied to its own backend list. `idb-keyval` is minimal but IndexedDB-only. Raw `localStorage` makes you reinvent JSON serialization, TTL envelopes, key prefixing, and SSR guards on every project. `@mongez/cache` ships one async API, a tiny driver contract, per-entry TTL, key prefixing for multi-app domains, optional at-rest encryption (including an encrypted IndexedDB driver), and a shape that drops straight into `@mongez/atom`'s `persist` slot — pick a backend at boot, never touch it again.

```ts
import cache, { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new PlainLocalStorageDriver() });

await cache.set("user", { id: 1, name: "Hasan" });
await cache.set("token", "abc123", 60 * 15); // 15-minute TTL
await cache.get("user"); // { id: 1, name: "Hasan" }
```

---

## Features

| Feature | Description |
|---|---|
| **Pluggable drivers** | Swap `localStorage`, `sessionStorage`, IndexedDB, in-memory, or your own backend without touching call sites. |
| **One async API** | `set` / `get` / `has` / `remove` / `clear` / `keys` / `getAll` — every method returns a `Promise`, identical across every driver. |
| **Per-entry TTL** | Pass an `expiresAfter` (seconds) on `set`, or configure a global default. Expired reads return the fallback and self-clean. |
| **Key prefixing** | One option namespaces every key — essential when multiple apps share a domain. |
| **At-rest encryption** | `EncryptedLocalStorageDriver` / `EncryptedSessionStorageDriver` / `EncryptedIndexedDBDriver` route values through a configurable encrypt/decrypt pair. |
| **Opt-in IndexedDB** | `IndexedDBDriver` / `EncryptedIndexedDBDriver` for structured values and quotas beyond Web Storage's ~5MB — never wired up by default. |
| **Bulk reads** | `getAll()` returns every live entry as one `{ key: value }` object; `keys()` lists the caller-facing keys owned by the driver. |
| **Custom serializers** | Override `JSON.stringify` / `JSON.parse` globally or per driver for non-JSON shapes. |
| **Custom drivers** | Extend `BaseCacheEngine` for cookies, remote stores, or any other backend — the envelope and TTL stay free. |
| **SSR-aware** | `RunTimeDriver` is a Web-Storage-free fallback for Node and tests. |
| **Atom-ready** | The driver shape matches `@mongez/atom`'s async `PersistAdapter` contract — drop it in directly. |
| **Hot-swappable** | `cache.setDriver(newDriver)` rotates backends at runtime without rebuilding call sites. |
| **TypeScript-first** | First-class types for the driver, manager, and configuration surfaces. |
| **Framework-agnostic** | Zero React / Vue / Angular coupling. Works in any browser-side runtime. |

---

## Installation

```sh
npm install @mongez/cache
```

```sh
yarn add @mongez/cache
```

```sh
pnpm add @mongez/cache
```

Requires **Node >=20** (for the build/test toolchain — the package itself runs in any browser). `@mongez/encryption` is a peer dependency, needed only when using the encrypted drivers.

---

## Quick start

```ts
import cache, {
  PlainLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

// 1. Pick a backend at boot — call this exactly once in your app entry.
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",          // namespace every key (multi-app domains)
  expiresAfter: 60 * 60,    // optional default TTL: 1 hour
});

// 2. Use the same async API for any JSON-serializable value.
await cache.set("user", { id: 1, name: "Hasan" });
await cache.set("letters", ["a", "b", "c"]);
await cache.set("token", "abc123", 60 * 15); // override the default TTL

// 3. Reads return the stored value, or a default when missing/expired.
await cache.get("user");               // { id: 1, name: "Hasan" }
await cache.get("ghost", "fallback");  // "fallback"
await cache.has("user");               // true

// 4. Remove a single key, or wipe everything.
await cache.remove("user");
await cache.clear();
```

> **Every storage-touching method is async.** `PlainLocalStorageDriver`, `PlainSessionStorageDriver` and `RunTimeDriver` still do their work synchronously under the hood and resolve immediately — but they return a `Promise`, so `await` (or `.then`) is required at every call site as of 2.0.0. See [Migration from 1.x](#migration-from-1x-to-20) below.

---

## The CacheManager facade

The default export `cache` is a pre-built `CacheManager` singleton. Configure it once at boot — every import everywhere reads the same instance.

```ts
import cache, { CacheManager, PlainLocalStorageDriver } from "@mongez/cache";

// Hot-swap the underlying driver at runtime.
cache.setDriver(new PlainLocalStorageDriver());
cache.getDriver();

// Or build a second manager for sibling concerns — e.g. long-lived
// preferences in localStorage AND a tab-scoped wizard in sessionStorage.
const sessionCache = new CacheManager();
sessionCache.setDriver(new PlainLocalStorageDriver());
sessionCache.setPrefixKey("session-");
```

Every method on the manager forwards to the active driver.

| Method | Behaviour | Note |
|---|---|---|
| `await cache.set(key, value, expiresAfter?)` | Write a value; `expiresAfter` in seconds. | Resolves to the manager for chaining. |
| `await cache.get(key, defaultValue?)` | Read a value, or the default when missing or expired. | Default is `null` from the facade. |
| `await cache.has(key)` | `true` for a live (non-expired) entry. | Agrees with `get()` on expiry — an expired entry is evicted and reported absent. |
| `await cache.remove(key)` | Delete a single entry. | Resolves to the manager. |
| `await cache.keys()` | List the caller-facing keys owned by the active driver. | Prefix is stripped — feed the results straight back into `get()` / `remove()`. |
| `await cache.getAll()` | Read every live entry as one `{ key: value }` object. | Null-prototype result; safe against a stored `__proto__` / `constructor` / `prototype` key. |
| `await cache.clear()` | Wipe the driver's storage. | Prefix-scoped when a prefix is configured — see note below. |
| `cache.setPrefixKey(p)` / `cache.getPrefixKey()` | Namespace control. | Synchronous — bare keys at call sites, the prefix is injected internally. |
| `cache.setValueConverter(fn)` / `cache.setValueParser(fn)` | Override the default `JSON.stringify` / `JSON.parse`. | Synchronous, per driver. |
| `cache.setDriver(d)` / `cache.getDriver()` | Hot-swap the backend at runtime. | Use to switch between plain and encrypted at runtime. |

> **`cache.clear()` is scoped to the configured prefix.** With a `prefix` set, only keys carrying it are removed — other apps sharing the same origin are untouched. With no prefix configured, the driver owns the whole namespace and `clear()` wipes it entirely.

Configuration helpers:

```ts
import {
  setCacheConfigurations,
  getCacheConfigurations,
  getCacheConfig,
} from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",
  expiresAfter: 60 * 60,
});

getCacheConfigurations();          // full Partial<CacheConfigurations>
getCacheConfig("expiresAfter");    // 3600
```

---

## Built-in drivers

Every driver implements the same async `CacheDriverInterface`. Pick the one that matches your lifetime requirements; swap freely without touching consumers.

| Driver | Backing storage | Use when |
|---|---|---|
| `PlainLocalStorageDriver` | `window.localStorage` | Cross-session persistence (user prefs, themes, draft data). |
| `PlainSessionStorageDriver` | `window.sessionStorage` | Tab-scoped state (wizard progress, scroll position, drafts). |
| `RunTimeDriver` | In-memory `Map` | Tests, SSR fallback, ephemeral page-lifetime memos. |
| `EncryptedLocalStorageDriver` | `localStorage` + encrypt/decrypt | Auth tokens, refresh tokens, PII at rest across sessions. |
| `EncryptedSessionStorageDriver` | `sessionStorage` + encrypt/decrypt | Tab-scoped tokens (e.g. short-lived single-tab sessions). |
| `IndexedDBDriver` *(opt-in)* | `window.indexedDB` | Structured values (`Date`, `Map`, `Set`, `ArrayBuffer`), or storage beyond Web Storage's ~5MB quota. |
| `EncryptedIndexedDBDriver` *(opt-in)* | `window.indexedDB` + encrypt/decrypt | Same as above, encrypted at rest. |

```ts
import {
  PlainLocalStorageDriver,
  PlainSessionStorageDriver,
  RunTimeDriver,
  setCacheConfigurations,
} from "@mongez/cache";

// Pick one at boot.
setCacheConfigurations({ driver: new PlainLocalStorageDriver() });
```

The plain drivers wrap every value in a `{data, expiresAt}` JSON envelope before storage so TTL works without bloating the call site. On read, the envelope is unwrapped — consumers see just the inner `data`. Expired entries are deleted on read.

You can also use a driver directly without the manager:

```ts
const driver = new PlainLocalStorageDriver();
driver.setPrefixKey("scoped-");
await driver.set("user", { id: 1 });
await driver.get("user"); // { id: 1 }
```

---

## IndexedDB drivers (opt-in)

`IndexedDBDriver` and `EncryptedIndexedDBDriver` are **never the default** — nothing in the package constructs one for you, because opening a database is a side effect a plain import should not trigger. Opt in explicitly:

```ts
import cache, { IndexedDBDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new IndexedDBDriver() });

await cache.set("session.preferences", { theme: "dark", lastSeen: new Date() });
await cache.get("session.preferences"); // { theme: "dark", lastSeen: Date }
```

Storage layout: a single object store with out-of-line keys, where the record is `{ value, expiresAt }`. Values pass through the structured clone algorithm — `Date`, `Map`, `Set`, `ArrayBuffer` and friends survive a round-trip untouched, with no JSON pass. Concurrent calls before the database is open share one memoized `open()` request; `onblocked` / `onversionchange` are handled for you.

```ts
const driver = new IndexedDBDriver({
  databaseName: "my-app",   // default: "mongez-cache"
  storeName: "cache",       // default: "cache"
  version: 2,                // default: 1
  onUpgrade({ database, store, oldVersion, newVersion, transaction }) {
    // Called inside the versionchange transaction. The object store
    // already exists by the time this runs — only data migration and
    // extra indexes belong here. Nothing async in here is awaited.
  },
});

IndexedDBDriver.isSupported(); // check before opting in, e.g. during SSR
```

`EncryptedIndexedDBDriver` extends `IndexedDBDriver` and requires the same `encryption` configuration as the encrypted Web Storage drivers:

```ts
import { encrypt, decrypt, setEncryptionConfigurations } from "@mongez/encryption";
import { EncryptedIndexedDBDriver, setCacheConfigurations } from "@mongez/cache";

setEncryptionConfigurations({ key: "app-secret" });

setCacheConfigurations({
  driver: new EncryptedIndexedDBDriver(),
  encryption: { encrypt, decrypt },
});

await cache.set("auth.tokens", { access, refresh }, 60 * 30);
await cache.get("auth.tokens"); // decrypted transparently
```

The whole `{data, expiresAt}` envelope is encrypted, so tampering with the plaintext `expiresAt` kept alongside the record (used to evict entries without decrypting every row on GC) cannot extend a TTL — `get()` always re-checks the authenticated copy inside the cypher.

Errors specific to this driver, all exported from the package root:

| Error | Thrown when |
|---|---|
| `IndexedDBUnavailableError` | `indexedDB` is not defined in this runtime (SSR, Node, a locked-down browser mode). |
| `CacheQuotaExceededError` | The origin is out of storage quota; carries the offending `key` and the original error as `cause`. |
| `IndexedDBBlockedError` | Another tab holds the database open at an older version, blocking a schema upgrade. |

> **Why IndexedDB isn't the default.** It's asynchronous, per-origin quota'd, and unavailable during server-side rendering, while `localStorage` is present in every browser context the other drivers already support. Consumers who need more than the ~5MB Web Storage budget, or structured values, opt in explicitly.

---

## Encrypted cache

The encrypted drivers route every value through a configurable encrypt/decrypt pair before reading and writing. The pair is read from configuration on every call, so you can rotate it without rebuilding driver instances. Both hooks may be sync or async — the drivers `await` whatever comes back.

[`@mongez/encryption`](https://github.com/hassanzohdy/mongez-encryption) `^2.0.0` ships a WebCrypto AES-256-GCM `encrypt`/`decrypt` pair that drops in directly — but anything with `{ encrypt, decrypt }` works, including a synchronous `1.x` pair.

```ts
import {
  encrypt,
  decrypt,
  setEncryptionConfigurations,
} from "@mongez/encryption";
import {
  EncryptedLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

// Configure the encryption key once at boot.
setEncryptionConfigurations({ key: "app-secret" });

setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: { encrypt, decrypt },
});

await cache.set("auth.accessToken", "abc123");
// On disk: { "auth.accessToken": "<AES-GCM cyphertext>" }
await cache.get("auth.accessToken"); // "abc123" — decrypted transparently
```

> **The `encryption` key is mandatory.** Without it, `set` / `get` on an encrypted driver throw at runtime. Always pass `{ encrypt, decrypt }`.

> **A tampered or undecryptable entry is evicted, not thrown.** A corrupted cypher, a rotated key, or a failed AES-GCM auth tag makes `get()` remove the offending entry and return the default value instead of throwing from a call site that reasonably expects to be infallible.

---

## `keys()` and `getAll()`

Every driver — Web Storage, runtime, and IndexedDB alike — supports listing and bulk-reading its own entries:

```ts
await cache.set("user.name", "Hasan");
await cache.set("user.email", "hasan@example.com");

await cache.keys();   // ["user.name", "user.email"]  (prefix stripped)
await cache.getAll(); // { "user.name": "Hasan", "user.email": "hasan@example.com" }
```

Both are scoped to the configured prefix and skip expired entries. `getAll()` builds its result onto a null-prototype object and routes any stored `__proto__` / `constructor` / `prototype` key through `Object.defineProperty` — cache keys are attacker-reachable on a shared origin, so a poisoned key round-trips as inert data instead of reaching a prototype setter.

---

## TTL and expiration

TTL is **always in seconds.** Pass a third argument to `set` for an inline expiry, or configure a default for every write that omits one.

```ts
await cache.set("token", "abc123", 60 * 15); // 15 minutes
await cache.set("session", value, 60);       // 1 minute
await cache.set("static", data, 0);          // 0 = no expiry (falsy disables TTL)
```

Global default:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  expiresAfter: 60 * 60, // 1 hour for every entry that doesn't override
});

await cache.set("user", payload);          // expires in 1 hour
await cache.set("token", value, 60 * 5);   // overrides to 5 minutes
```

| Value | Behaviour | Note |
|---|---|---|
| `expiresAfter: 60 * 15` | Entry expires 15 minutes after `set`. | Per-call argument wins over the global default. |
| `expiresAfter: 0` | No expiry for this entry. | Falsy disables TTL even when a global default exists. |
| `expiresAfter` omitted | Uses the global default if set, otherwise no expiry. | Reads past expiry remove the entry and return the default value. |

---

## Custom drivers

Extend `BaseCacheEngine` to plug in any storage backend. The base class handles the `{data, expiresAt}` envelope, expiration checks, prefix application, JSON conversion, corruption recovery, and lifts a synchronous `storage` into the same async contract every driver shares — the subclass only needs to point `storage` at something with `getItem` / `setItem` / `removeItem` / `clear`.

### Minimum viable driver

```ts
import { BaseCacheEngine } from "@mongez/cache";

class MyDriver extends BaseCacheEngine {
  public storage = {
    getItem: (key: string) => /* read */,
    setItem: (key: string, value: string) => /* write */,
    removeItem: (key: string) => /* delete */,
    clear: () => /* drop everything */,
  };
}
```

`storage` mirrors the DOM `Storage` interface, but the base engine treats it as opaque — any object with the four methods above works, and `getItem` / `setItem` / `removeItem` may themselves return a `Promise` if the backend is naturally async.

### Cookie-backed driver

```ts
import { BaseCacheEngine, setCacheConfigurations } from "@mongez/cache";

class CookieDriver extends BaseCacheEngine {
  public storage = {
    getItem: (key: string) => {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(
        new RegExp(`(?:^|; )${key}=([^;]*)`)
      );
      return match ? decodeURIComponent(match[1]) : null;
    },
    setItem: (key: string, value: string) => {
      document.cookie =
        `${key}=${encodeURIComponent(value)};path=/;max-age=31536000;samesite=lax`;
    },
    removeItem: (key: string) => {
      document.cookie = `${key}=;path=/;max-age=0`;
    },
    clear: () => {
      // Enumerate document.cookie and expire each entry.
    },
  };
}

setCacheConfigurations({ driver: new CookieDriver() });
```

Cookies are SSR-friendly when the server can read the request's `Cookie` header — wrap the same shape around your framework's server-side cookie API for the SSR path.

### Override the envelope or the full value

For storage that already accepts structured data (IndexedDB, binary protocols), override `convertValue` / `parseValue` to skip JSON — the base engine still wraps in `{data, expiresAt}` so TTL keeps working. For a complete value transform (encrypt, compress, sign), override `set` / `get` directly and keep them `async` — `EncryptedLocalStorageDriver` and `IndexedDBDriver` are the in-tree references.

```ts
import { PlainLocalStorageDriver } from "@mongez/cache";

class CompressedDriver extends PlainLocalStorageDriver {
  public async set(key: string, value: any) {
    await this.write(this.getKey(key), compress(JSON.stringify(value)));
    return this;
  }

  public async get(key: string, defaultValue: any = null) {
    const raw = await this.read(this.getKey(key));
    if (raw === null) return defaultValue;
    try {
      return JSON.parse(decompress(raw));
    } catch {
      return defaultValue;
    }
  }
}
```

> **Overriding `set` skips the `{data, expiresAt}` envelope and disables TTL.** Add your own expiry mechanism (a per-key companion entry, or fold the timestamp into the transformed payload) if you need it.

> **Need a fully async remote backend (an HTTP cache API, a KV store)?** Implement `CacheDriverInterface` directly rather than extending `BaseCacheEngine` — the base class assumes a `storage`-shaped backend; a from-scratch driver has full control over each method's `Promise`.

---

## Recipes

### Cache an API response for 5 minutes

Reach for this when you have an expensive endpoint that updates rarely — product recommendations, dashboards, currency rates.

```ts
import cache, {
  PlainLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

setCacheConfigurations({ driver: new PlainLocalStorageDriver() });

async function getProductRecommendations(productId: string) {
  const cacheKey = `recs.${productId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const recs = await fetch(`/api/products/${productId}/recommendations`)
    .then((r) => r.json());

  // Recompute at most once every 5 minutes per product.
  await cache.set(cacheKey, recs, 60 * 5);
  return recs;
}
```

### Encrypt sensitive tokens at rest

Tokens, refresh tokens, and PII should never sit in plaintext `localStorage` — any extension or script with `window` access can read them.

```ts
import {
  encrypt,
  decrypt,
  setEncryptionConfigurations,
} from "@mongez/encryption";
import cache, {
  EncryptedLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

setEncryptionConfigurations({ key: import.meta.env.VITE_APP_SECRET });

setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: { encrypt, decrypt },
  expiresAfter: 60 * 60, // 1-hour default for tokens
});

await cache.set("auth.accessToken", accessToken);
await cache.set("auth.refreshToken", refreshToken, 60 * 60 * 24 * 30); // 30 days

// On reload, transparently decrypted:
const accessToken = await cache.get("auth.accessToken");
```

### Store structured data with IndexedDB

Reach for `IndexedDBDriver` when a cached value is bigger than Web Storage's quota comfortably allows, or holds a `Date` / `Map` / `Set` you don't want to lose to JSON.

```ts
import cache, { IndexedDBDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new IndexedDBDriver() });

await cache.set("report.rows", hugeRowArray);
await cache.set("report.generatedAt", new Date());

const generatedAt = await cache.get("report.generatedAt"); // a real Date instance
```

### Swap drivers per environment

Use `RunTimeDriver` in tests for fast, isolated, no-cleanup runs; `PlainLocalStorageDriver` in the browser; either in SSR.

```ts
import {
  PlainLocalStorageDriver,
  RunTimeDriver,
  setCacheConfigurations,
} from "@mongez/cache";

const driver =
  typeof window === "undefined" || process.env.NODE_ENV === "test"
    ? new RunTimeDriver()
    : new PlainLocalStorageDriver();

setCacheConfigurations({ driver, prefix: "app-" });
```

Same call sites work on server, client, and test runner. The server sees an empty in-memory cache (fresh per request if you re-bootstrap), and the client takes over with persistent storage on hydration.

### Namespace caches per app on a shared domain

When `app-a.example.com` and `app-b.example.com` share `localStorage` (e.g. a single SPA shell with sub-apps), a prefix prevents key collisions.

```ts
import {
  CacheManager,
  PlainLocalStorageDriver,
} from "@mongez/cache";

// One manager per app — no shared global needed.
export const appACache = new CacheManager();
appACache
  .setDriver(new PlainLocalStorageDriver())
  .setPrefixKey("app-a-");

export const appBCache = new CacheManager();
appBCache
  .setDriver(new PlainLocalStorageDriver())
  .setPrefixKey("app-b-");

await appACache.set("user", { id: 1 });  // stored as "app-a-user"
await appBCache.set("user", { id: 99 }); // stored as "app-b-user"

await appACache.get("user"); // { id: 1 }  — does not see app B's user
```

### Persist `@mongez/atom` state through the cache

`@mongez/atom`'s `persist` slot accepts an async `{ get, set, remove }` adapter, which is exactly the cache manager's shape.

```ts
// adapters/cacheAdapter.ts
import cache from "@mongez/cache";

export const cacheAdapter = {
  get: (key: string) => cache.get(key),
  set: (key: string, value: unknown) => cache.set(key, value),
  remove: (key: string) => cache.remove(key),
};
```

```ts
// atoms/preferences.ts
import { createAtom } from "@mongez/atom";
import { cacheAdapter } from "../adapters/cacheAdapter";

const themeAtom = createAtom({
  key: "ui.theme",
  default: "light",
  persist: cacheAdapter,
});

themeAtom.update("dark");
// Reload — themeAtom.value is "dark".
```

Swap the cache's driver from plain to encrypted (or to IndexedDB), and every atom that uses this adapter gets the new persistence with zero changes at the atom call sites.

### Mix plain and encrypted persistence per atom

When some atoms hold tokens (encrypted) and others hold UI prefs (plain), build one adapter per backend rather than one global one.

```ts
import {
  CacheManager,
  PlainLocalStorageDriver,
  EncryptedLocalStorageDriver,
} from "@mongez/cache";
import { encrypt, decrypt } from "@mongez/encryption";

const plain = new CacheManager();
plain.setDriver(new PlainLocalStorageDriver()).setPrefixKey("app-");

const secure = new CacheManager();
secure.setDriver(new EncryptedLocalStorageDriver()).setPrefixKey("secure-");

export const plainAdapter = {
  get: (k: string) => plain.get(k),
  set: (k: string, v: unknown) => plain.set(k, v),
  remove: (k: string) => plain.remove(k),
};

export const secureAdapter = {
  get: (k: string) => secure.get(k),
  set: (k: string, v: unknown) => secure.set(k, v),
  remove: (k: string) => secure.remove(k),
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
  persist: secureAdapter,
});
```

The token sits encrypted on disk; the theme sits plain. The atom code doesn't know the difference.

### Subscribe to cache writes

`@mongez/cache` doesn't emit events on its own. When you need write-through subscriptions (cross-tab sync, analytics, debugging), wrap the cache with `@mongez/events`.

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
  on: events.subscribe.bind(events),
};

observableCache.on("cache.set", ({ key, value }) => {
  console.log("wrote", key, value);
});
```

For most reactive use cases, routing the same data through a `@mongez/atom` atom with a `persist` adapter is simpler — atoms already broadcast updates.

---

## Migration from 1.x to 2.0

`@mongez/cache` 2.0 makes the driver contract fully async and adds two opt-in IndexedDB drivers. See [`CHANGELOG.md`](./CHANGELOG.md) for the complete, dated list — the short version:

1. **`await` every call.** `set` / `get` / `has` / `remove` / `clear` (unchanged) plus the new `keys` / `getAll` all return a `Promise` now, on every driver — including `PlainLocalStorageDriver`, `PlainSessionStorageDriver` and `RunTimeDriver`, which still run synchronously under the hood and simply resolve immediately:

   ```diff
   - const value = cache.get("name");
   + const value = await cache.get("name");
   ```

2. **`has()` now agrees with `get()` on expiry.** On the plain drivers, an expired entry is evicted and reported absent by `has()` instead of reported present and then silently vanishing on the next `get()`.
3. **`@mongez/encryption` bumps to `^2.0.0`.** Its `encrypt`/`decrypt` moved to async WebCrypto AES-256-GCM; a synchronous `1.x` pair still works unchanged, since the drivers `await` whatever is returned.
4. **IndexedDB is opt-in, not a new default.** Existing `localStorage` / `sessionStorage` / `RunTimeDriver` consumers need no driver change at all beyond the `await`s above. Opt into `IndexedDBDriver` / `EncryptedIndexedDBDriver` explicitly via `setCacheConfigurations({ driver: new IndexedDBDriver() })` if you want them.
5. **`getCacheConfig("encryption")` now narrows correctly.** It's generic over `keyof CacheConfigurations`, so the return type matches the key you passed instead of widening to a union of every config value. No code change needed unless you relied on the looser inferred type.

---

## TypeScript

```ts
import type {
  CacheDriverInterface,
  CacheManagerInterface,
  CacheConfigurations,
  IndexedDBDriverOptions,
  IndexedDBUpgradeContext,
} from "@mongez/cache";
```

Value parameters are typed as `any` — values pass through JSON serialization (or structured clone for IndexedDB, or your custom converter), so the surface stays open. For stronger guarantees, wrap the driver in a typed adapter at the call site.

> **`CacheConfigurations.valueParer` is one `r` short by design.** The typo is preserved for backward compatibility. Use `valueParer` — not `valueParser` — when passing it to `setCacheConfigurations`. The per-driver method `setValueParser` is correctly named.

---

## Related packages

| Package | Use when you need |
|---|---|
| [`@mongez/atom`](https://github.com/hassanzohdy/atom) | Framework-agnostic reactive state. Drop the cache into the `persist` slot for free localStorage / encrypted / IndexedDB / runtime persistence. |
| [`@mongez/encryption`](https://github.com/hassanzohdy/mongez-encryption) | WebCrypto-backed `encrypt` / `decrypt` pair for the encrypted cache drivers. |
| [`@mongez/events`](https://github.com/hassanzohdy/events) | Cross-feature pub/sub — pairs well with cache write subscriptions. |
| [`@mongez/dom`](https://github.com/hassanzohdy/dom) | Browser-side DOM utilities. Sister package, similar shape. |

---

## Further reading

- [`CHANGELOG.md`](./CHANGELOG.md) — release notes and documented quirks.
- [`llms-full.txt`](./llms-full.txt) — exhaustive single-file API surface for tool-assisted development.
- [`skills/`](./skills) — per-topic deep-dives (drivers, encryption, recipes, custom backends).

---

## License

MIT — see [LICENSE](./LICENSE).
