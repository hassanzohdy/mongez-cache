<div align="center">

# @mongez/cache

**Framework-agnostic cache facade with pluggable drivers — one API for localStorage, sessionStorage, in-memory, and encrypted variants.**

[![npm](https://img.shields.io/npm/v/@mongez/cache.svg)](https://www.npmjs.com/package/@mongez/cache)
[![license](https://img.shields.io/npm/l/@mongez/cache.svg)](LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@mongez/cache.svg)](https://bundlephobia.com/package/@mongez/cache)
[![downloads](https://img.shields.io/npm/dw/@mongez/cache.svg)](https://www.npmjs.com/package/@mongez/cache)

</div>

---

## Why @mongez/cache?

`localStorage`, `sessionStorage`, in-memory maps, and IndexedDB all solve similar problems with different APIs and lifetimes. `localforage` unifies them but is async-only and tied to its own backend list. `idb-keyval` is minimal but IndexedDB-only. Raw `localStorage` makes you reinvent JSON serialization, TTL envelopes, key prefixing, and SSR guards on every project. `@mongez/cache` ships one synchronous API, a tiny driver contract, per-entry TTL, key prefixing for multi-app domains, optional at-rest encryption, and a shape that drops straight into `@mongez/atom`'s `persist` slot — pick a backend at boot, never touch it again.

```ts
import cache, { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new PlainLocalStorageDriver() });

cache.set("user", { id: 1, name: "Hasan" });
cache.set("token", "abc123", 60 * 15); // 15-minute TTL
cache.get("user"); // { id: 1, name: "Hasan" }
```

---

## Features

| Feature | Description |
|---|---|
| **Pluggable drivers** | Swap `localStorage`, `sessionStorage`, in-memory, or your own backend without touching call sites. |
| **One synchronous API** | `set` / `get` / `has` / `remove` / `clear` — identical across every driver. |
| **Per-entry TTL** | Pass an `expiresAfter` (seconds) on `set`, or configure a global default. Expired reads return the fallback and self-clean. |
| **Key prefixing** | One option namespaces every key — essential when multiple apps share a domain. |
| **At-rest encryption** | `EncryptedLocalStorageDriver` / `EncryptedSessionStorageDriver` route values through a configurable encrypt/decrypt pair. |
| **Custom serializers** | Override `JSON.stringify` / `JSON.parse` globally or per driver for non-JSON shapes. |
| **Custom drivers** | Extend `BaseCacheEngine` for IndexedDB, cookies, remote stores — the envelope and TTL stay free. |
| **SSR-aware** | `RunTimeDriver` is a Web-Storage-free fallback for Node and tests. |
| **Atom-ready** | The driver shape matches `@mongez/atom`'s `PersistAdapter` contract — drop it in directly. |
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

`@mongez/encryption` is a peer dependency, needed only when using the encrypted drivers.

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

// 2. Use the same API for any JSON-serializable value.
cache.set("user", { id: 1, name: "Hasan" });
cache.set("letters", ["a", "b", "c"]);
cache.set("token", "abc123", 60 * 15); // override the default TTL

// 3. Reads return the stored value, or a default when missing/expired.
cache.get("user");               // { id: 1, name: "Hasan" }
cache.get("ghost", "fallback");  // "fallback"
cache.has("user");               // true

// 4. Remove a single key, or wipe everything.
cache.remove("user");
cache.clear();
```

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
| `cache.set(key, value, expiresAfter?)` | Write a value; `expiresAfter` in seconds. | Returns the manager for chaining. |
| `cache.get(key, defaultValue?)` | Read a value, or the default when missing or expired. | Default is `null` from the facade. |
| `cache.has(key)` | `true` when the raw storage entry exists. | Does not check expiry — use `get(...) !== null` for that. |
| `cache.remove(key)` | Delete a single entry. | Returns the manager. |
| `cache.clear()` | Wipe the entire backing storage. | Not prefix-scoped — see warning below. |
| `cache.setPrefixKey(p)` / `cache.getPrefixKey()` | Namespace control. | Bare keys at call sites; the prefix is injected internally. |
| `cache.setValueConverter(fn)` / `cache.setValueParser(fn)` | Override the default `JSON.stringify` / `JSON.parse`. | Per driver. |
| `cache.setDriver(d)` / `cache.getDriver()` | Hot-swap the backend at runtime. | Use to switch between plain and encrypted at runtime. |

> **`cache.clear()` is global to the backend.** `localStorage.clear()` wipes every key in the origin, not just the keys under your prefix. On shared domains, prefer `cache.remove(key)` per owned key.

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

Every driver implements the same `CacheDriverInterface`. Pick the one that matches your lifetime requirements; swap freely without touching consumers.

| Driver | Backing storage | Use when |
|---|---|---|
| `PlainLocalStorageDriver` | `window.localStorage` | Cross-session persistence (user prefs, themes, draft data). |
| `PlainSessionStorageDriver` | `window.sessionStorage` | Tab-scoped state (wizard progress, scroll position, drafts). |
| `RunTimeDriver` | In-memory `Record<string, ...>` | Tests, SSR fallback, ephemeral page-lifetime memos. |
| `EncryptedLocalStorageDriver` | `localStorage` + encrypt/decrypt | Auth tokens, refresh tokens, PII at rest across sessions. |
| `EncryptedSessionStorageDriver` | `sessionStorage` + encrypt/decrypt | Tab-scoped tokens (e.g. short-lived single-tab sessions). |

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
driver.set("user", { id: 1 });
driver.get("user"); // { id: 1 }
```

---

## Encrypted cache

The encrypted drivers route every value through a configurable encrypt/decrypt pair before reading and writing. The pair is read from configuration on every call, so you can rotate it without rebuilding driver instances.

[`@mongez/encryption`](https://github.com/hassanzohdy/mongez-encryption) ships a CryptoJS-backed pair that drops in directly — but anything with `{ encrypt, decrypt }` works.

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

cache.set("auth.accessToken", "abc123");
// On disk: { "auth.accessToken": "U2FsdGVkX18..." }  ← ciphertext
cache.get("auth.accessToken"); // "abc123" — decrypted transparently
```

> **The `encryption` key is mandatory.** Without it, `set` / `get` on an encrypted driver throw at runtime. Always pass `{ encrypt, decrypt }`.

> **Legacy ciphertext is read gracefully.** Entries written by pre-1.3 releases (raw value, no envelope) still decrypt correctly — when the payload doesn't look like the `{data, expiresAt}` envelope, the driver returns the value as-is with no expiration. No migration is required.

---

## TTL and expiration

TTL is **always in seconds.** Pass a third argument to `set` for an inline expiry, or configure a default for every write that omits one.

```ts
cache.set("token", "abc123", 60 * 15); // 15 minutes
cache.set("session", value, 60);       // 1 minute
cache.set("static", data, 0);          // 0 = no expiry (falsy disables TTL)
```

Global default:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  expiresAfter: 60 * 60, // 1 hour for every entry that doesn't override
});

cache.set("user", payload);              // expires in 1 hour
cache.set("token", value, 60 * 5);       // overrides to 5 minutes
```

| Value | Behaviour | Note |
|---|---|---|
| `expiresAfter: 60 * 15` | Entry expires 15 minutes after `set`. | Per-call argument wins over the global default. |
| `expiresAfter: 0` | No expiry for this entry. | Falsy disables TTL even when a global default exists. |
| `expiresAfter` omitted | Uses the global default if set, otherwise no expiry. | Reads past expiry remove the entry and return the default value. |

---

## Custom drivers

Extend `BaseCacheEngine` to plug in any synchronous storage. The base class handles the `{data, expiresAt}` envelope, expiration checks, prefix application, JSON conversion, and corruption recovery — the subclass only needs to point `storage` at something with `getItem` / `setItem` / `removeItem` / `clear`.

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

`storage` mirrors the DOM `Storage` interface, but the base engine treats it as opaque — any object with the four methods above works.

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

For storage that already accepts structured data (in-memory maps, IndexedDB, binary protocols), override `convertValue` / `parseValue` to skip JSON — the base engine still wraps in `{data, expiresAt}` so TTL keeps working. For a complete value transform (encrypt, compress, sign), override `set` / `get` directly — `EncryptedLocalStorageDriver` is the in-tree reference.

```ts
import { PlainLocalStorageDriver } from "@mongez/cache";

class CompressedDriver extends PlainLocalStorageDriver {
  public set(key: string, value: any) {
    this.storage.setItem(this.getKey(key), compress(JSON.stringify(value)));
    return this;
  }

  public get(key: string, defaultValue: any = null) {
    const raw = this.storage.getItem(this.getKey(key));
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

> **`BaseCacheEngine.get` is synchronous.** IndexedDB is async — for real IDB-backed reads, either maintain an in-memory mirror populated on boot, or route the value through `@mongez/atom`'s `persist` slot (which accepts async adapters).

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
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const recs = await fetch(`/api/products/${productId}/recommendations`)
    .then((r) => r.json());

  // Recompute at most once every 5 minutes per product.
  cache.set(cacheKey, recs, 60 * 5);
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

cache.set("auth.accessToken", accessToken);
cache.set("auth.refreshToken", refreshToken, 60 * 60 * 24 * 30); // 30 days

// On reload, transparently decrypted:
const accessToken = cache.get("auth.accessToken");
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

appACache.set("user", { id: 1 });  // stored as "app-a-user"
appBCache.set("user", { id: 99 }); // stored as "app-b-user"

appACache.get("user"); // { id: 1 }  — does not see app B's user
```

### Persist `@mongez/atom` state through the cache

`@mongez/atom`'s `persist` slot accepts any `{ get, set, remove }` adapter. The cache's API matches by name; a thin wrapper normalizes return types (the driver chains, the atom expects `void`).

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

Swap the cache's driver from plain to encrypted, and every atom that uses this adapter gets encrypted persistence with zero changes at the atom call sites.

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
  set: (k: string, v: unknown) => { plain.set(k, v); },
  remove: (k: string) => { plain.remove(k); },
};

export const secureAdapter = {
  get: (k: string) => secure.get(k),
  set: (k: string, v: unknown) => { secure.set(k, v); },
  remove: (k: string) => { secure.remove(k); },
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
  set(key: string, value: unknown, expiresAfter?: number) {
    cache.set(key, value, expiresAfter);
    events.trigger("cache.set", { key, value });
  },
  get: cache.get.bind(cache),
  remove(key: string) {
    cache.remove(key);
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

## TypeScript

```ts
import type {
  CacheDriverInterface,
  CacheManagerInterface,
  CacheConfigurations,
} from "@mongez/cache";
```

Value parameters are typed as `any` — values pass through JSON serialization (or your custom converter), so the surface stays open. For stronger guarantees, wrap the driver in a typed adapter at the call site.

> **`CacheConfigurations.valueParer` is one `r` short by design.** The typo is preserved for backward compatibility. Use `valueParer` — not `valueParser` — when passing it to `setCacheConfigurations`. The per-driver method `setValueParser` is correctly named.

---

## Related packages

| Package | Use when you need |
|---|---|
| [`@mongez/atom`](https://github.com/hassanzohdy/atom) | Framework-agnostic reactive state. Drop the cache into the `persist` slot for free localStorage / encrypted / runtime persistence. |
| [`@mongez/encryption`](https://github.com/hassanzohdy/mongez-encryption) | CryptoJS-backed `encrypt` / `decrypt` pair for the encrypted cache drivers. |
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
