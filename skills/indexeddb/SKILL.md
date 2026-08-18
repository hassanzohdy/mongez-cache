---
name: mongez-cache-indexeddb
description: |
  Reference for the opt-in `IndexedDBDriver` and `EncryptedIndexedDBDriver` (2.0.0+) — construction options, structured-clone storage (no JSON pass), the migration hook, quota/blocked/unavailable error types, and how they differ from the Web Storage drivers.
---

# IndexedDB drivers (opt-in)

`IndexedDBDriver` and `EncryptedIndexedDBDriver` back the cache with `window.indexedDB`. Unlike every other driver, they are **never wired up automatically** — nothing in the package constructs one for you, because opening a database is a side effect a plain import shouldn't trigger. Opt in explicitly.

## Signature

```ts
import { IndexedDBDriver, EncryptedIndexedDBDriver } from "@mongez/cache";

class IndexedDBDriver implements CacheDriverInterface {
  public constructor(options?: IndexedDBDriverOptions);
  public static isSupported(): boolean;
  public close(): Promise<this>;
}

class EncryptedIndexedDBDriver extends IndexedDBDriver implements CacheDriverInterface { ... }
```

Both implement `CacheDriverInterface` directly rather than extending `BaseCacheEngine` — IndexedDB's cursor/transaction model doesn't fit the simple `getItem`/`setItem` shape the base class expects.

## Basic usage

```ts
import cache, { IndexedDBDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new IndexedDBDriver() });

await cache.set("session.preferences", { theme: "dark", lastSeen: new Date() });
await cache.get("session.preferences"); // { theme: "dark", lastSeen: Date }
```

## Why opt-in, and why it exists

- **Structured clone, not JSON.** `Date`, `Map`, `Set`, `ArrayBuffer` and similar survive a round-trip untouched — no `JSON.stringify` pass. Values that aren't cloneable (functions, DOM nodes) are rejected by the browser; supply `setValueConverter` / `setValueParser` if you need to serialize those yourself.
- **Bigger quota than Web Storage's ~5MB.** Reach for this driver when a cached value is large or you're hitting `QuotaExceededError` on `localStorage`.
- **Async and unavailable during SSR.** `localStorage` is present in every browser context the other drivers already support; IndexedDB is not available in Node/SSR and requires real async plumbing (connection open, transactions). Consumers who need the extra headroom opt in.

## Construction options

```ts
type IndexedDBDriverOptions = {
  databaseName?: string;   // default: "mongez-cache"
  storeName?: string;      // default: "cache"
  version?: number;        // default: 1
  onUpgrade?: (context: IndexedDBUpgradeContext) => void;
};

const driver = new IndexedDBDriver({
  databaseName: "my-app",
  storeName: "cache",
  version: 2,
  onUpgrade({ database, store, oldVersion, newVersion, transaction }) {
    // The cache object store already exists by the time this runs —
    // only data migration / extra indexes belong here.
  },
});
```

**`onUpgrade` runs inside the `versionchange` transaction.** Anything async started inside it is *not* awaited — IndexedDB closes the upgrade transaction the moment control returns to the event loop, so keep the hook synchronous.

## Checking support before opting in

```ts
IndexedDBDriver.isSupported(); // false during SSR, in Node, or when storage is blocked
```

Use this at bootstrap instead of catching `IndexedDBUnavailableError` from the first read:

```ts
const driver = IndexedDBDriver.isSupported()
  ? new IndexedDBDriver()
  : new RunTimeDriver();

setCacheConfigurations({ driver });
```

## Storage layout

A single object store with out-of-line keys. The key is the (prefixed) cache key; the record is `{ value, expiresAt }`. `value` has already passed through `setValueConverter` (identity by default).

## Connection handling

- Concurrent calls made before the database is open share **one** memoized `open()` request rather than racing into separate connections.
- `onblocked` (another tab holds an older version open) rejects the pending operation with `IndexedDBBlockedError` instead of hanging forever.
- `onversionchange` (another tab is upgrading the schema) closes this connection and clears the memo; the next operation reopens it.
- A failed `open()` is not memoized — a transient failure doesn't poison the driver for the page's lifetime.
- `driver.close()` closes the connection early (mostly useful in tests, or before deleting the database). The next operation reopens it.

## `keys()` and `getAll()`

```ts
await cache.keys();   // caller-facing keys, prefix stripped
await cache.getAll(); // { key: value, ... } — every live entry
```

`getAll()` walks the object store with a single cursor inside one transaction, builds the result onto a null-prototype object, and routes a stored `__proto__` / `constructor` / `prototype` key through `Object.defineProperty` — cache keys are attacker-reachable on a shared origin, so a poisoned key round-trips as inert data instead of reaching a prototype setter.

## `clear()`

Prefix-scoped, same as the Web Storage drivers: with a prefix configured, a cursor walks the store deleting only matching keys inside one transaction (so the deletions can't be interleaved with a concurrent write); with no prefix, the whole store is cleared in one `store.clear()` call.

## Errors

All exported from the package root:

| Error | Thrown when |
|---|---|
| `IndexedDBUnavailableError` | `indexedDB` is not defined in this runtime — SSR, a Node build step, a worker without the API, or a browser mode that blocks storage. Thrown loudly rather than silently degrading to a cache miss. |
| `CacheQuotaExceededError` | A write is rejected for being out of origin quota. Carries the offending `key` and the original `DOMException` as `cause`. |
| `IndexedDBBlockedError` | Another tab holds the database open at an older version, blocking a schema upgrade. |

```ts
import { IndexedDBDriver, CacheQuotaExceededError } from "@mongez/cache";

try {
  await cache.set("big.blob", hugeArrayBuffer);
} catch (error) {
  if (error instanceof CacheQuotaExceededError) {
    // evict something, or surface a "storage full" message
  }
}
```

## EncryptedIndexedDBDriver

Extends `IndexedDBDriver` and requires the same `encryption` configuration as the encrypted Web Storage drivers:

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

The whole `{data, expiresAt}` envelope is encrypted. `expiresAt` is *also* kept in the clear on the record — otherwise garbage collection would need to decrypt every row to find expired ones — but `get()` always re-checks the authenticated copy sealed inside the cypher, so tampering with the plaintext `expiresAt` to extend a TTL buys an attacker nothing (it can only shorten the effective lifetime by self-evicting early). A decrypt/auth failure (tampered cypher, rotated key) is treated as a miss and the poisoned entry is evicted — matching the encrypted Web Storage drivers.

`getAll()` on this driver decrypts entries one key at a time via `get()` rather than in the single-cursor transaction the plain driver uses, because a transaction can't `await` a decrypt mid-flight.

## Gotchas

- **Never the default.** `setCacheConfigurations` doesn't construct one for you — pass `driver: new IndexedDBDriver()` explicitly.
- **Not available during SSR / in Node.** Check `IndexedDBDriver.isSupported()` or catch `IndexedDBUnavailableError` before relying on it in an isomorphic code path.
- **Non-cloneable values throw synchronously**, not as a rejected promise's error event — functions, class instances with methods, and DOM nodes can't cross the structured-clone boundary.
- **`onUpgrade` must stay synchronous.** Async work started inside it runs after the upgrade transaction has already closed.
