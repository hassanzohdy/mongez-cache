---
name: mongez-cache-overview
description: |
  @mongez/cache — framework-agnostic async cache facade with pluggable drivers (localStorage, sessionStorage, opt-in IndexedDB, runtime, encrypted variants), TTL, key prefixing, bulk reads (`getAll`), and configurable encryption. Swappable backends without touching call sites. Requires Node >=20.
---

# @mongez/cache — Overview

One cache API, swappable drivers. Pick a backend at boot — `localStorage`, `sessionStorage`, in-memory map, opt-in IndexedDB, or any of those with encryption layered on — then call `cache.set` / `cache.get` / `cache.remove` / `cache.clear` everywhere else. Every storage-touching method is `async`. TTL, key prefixing, and default-fallbacks built in. Pairs cleanly with `@mongez/atom`'s `persist` slot.

## Highlighted features

<div class="mongez-highlights">

<div class="mongez-highlight" data-accent="ice">
  <svg class="mongez-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  <h3>One async API, seven drivers</h3>
  <p>Plain + encrypted variants for <code>localStorage</code> / <code>sessionStorage</code> / IndexedDB, plus a runtime in-memory driver. Configure once; swap drivers without touching call sites.</p>
</div>

<div class="mongez-highlight" data-accent="ice">
  <svg class="mongez-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  <h3>Per-entry TTL</h3>
  <p><code>await cache.set("token", value, 60 * 15)</code> — entries expire on read after their TTL. Or set a default for every key via configuration.</p>
</div>

<div class="mongez-highlight" data-accent="fire">
  <svg class="mongez-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  <h3>Encryption-at-rest</h3>
  <p><code>EncryptedLocalStorageDriver</code> / <code>EncryptedSessionStorageDriver</code> / <code>EncryptedIndexedDBDriver</code> run values through your encrypt/decrypt pair before writing. Sensitive cache values stay opaque on disk.</p>
</div>

<div class="mongez-highlight" data-accent="fire">
  <svg class="mongez-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  <h3>Opt-in IndexedDB</h3>
  <p><code>IndexedDBDriver</code> / <code>EncryptedIndexedDBDriver</code> for structured values and quotas beyond ~5MB. Never wired up by default — construct one explicitly.</p>
</div>

<div class="mongez-highlight" data-accent="bolt">
  <svg class="mongez-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
  <h3>Key prefixing</h3>
  <p><code>prefix: "shop-"</code> namespaces every key so multiple apps on the same domain can't collide. Set once at config time.</p>
</div>

<div class="mongez-highlight" data-accent="bolt">
  <svg class="mongez-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  <h3>Pairs with <code>@mongez/atom</code></h3>
  <p>Any driver satisfies the async <code>PersistAdapter</code> shape — drop it into an atom's <code>persist</code> slot and the atom hydrates from cache + writes through on update.</p>
</div>

</div>

## Install

```sh
npm install @mongez/cache
# or: yarn add @mongez/cache
# or: pnpm add @mongez/cache
```

Requires **Node >=20**. `@mongez/encryption` (`^2.0.0`) is an optional peer — install only when using the `Encrypted*` drivers.

## Quick peek

```ts
import cache, { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",          // namespace every key
  expiresAfter: 60 * 60,    // optional default TTL: 1 hour
});

await cache.set("user", { id: 1, name: "Hasan" });
await cache.set("token", "abc123", 60 * 15);   // override the default TTL
await cache.get("user");                        // { id: 1, name: "Hasan" }
```

Pick a backend at boot, then use the same async API everywhere.

## Available drivers

| Driver | Persistence | Notes |
|---|---|---|
| `PlainLocalStorageDriver` | Cross-session | JSON-serialised; supports TTL envelope |
| `PlainSessionStorageDriver` | Tab-lifetime | Same contract as local-storage variant |
| `EncryptedLocalStorageDriver` | Cross-session | Encrypt/decrypt before writing |
| `EncryptedSessionStorageDriver` | Tab-lifetime | Encrypted sessionStorage variant |
| `RunTimeDriver` | In-memory (lost on reload) | SSR-safe; no Web Storage dependency |
| `IndexedDBDriver` *(opt-in)* | Cross-session | Structured clone (no JSON pass); larger quota |
| `EncryptedIndexedDBDriver` *(opt-in)* | Cross-session | IndexedDB + encrypted envelope |

All drivers implement the same async `CacheDriverInterface` — `set` / `get` / `has` / `remove` / `clear` / `keys` / `getAll`.

## Key pitfalls

- **`setCacheConfigurations` must be called before first use.** The singleton's driver is `undefined` until you call it; `cache.set(...)` before configuring throws.
- **Every storage-touching method returns a `Promise`.** Even the synchronous-under-the-hood drivers (Web Storage, `RunTimeDriver`) resolve immediately rather than returning the value directly — `await` is required as of 2.0.0.
- **Web Storage drivers throw on the server** (no `localStorage` in Node). Gate driver selection with `typeof window === "undefined"` and fall back to `RunTimeDriver` for SSR paths.
- **`RunTimeDriver` instances are not shared.** Two instances have independent stores; no global in-memory registry.
- **IndexedDB is never the default.** Nothing constructs `IndexedDBDriver` for you — opt in explicitly via `setCacheConfigurations({ driver: new IndexedDBDriver() })`.

## Where to go next

- **[Basic usage](../basic-usage/)** — `cache.set` / `get` / `remove` / `clear`, TTL semantics
- **[Manager](../manager/)** — `CacheManager`, custom singletons, multi-cache apps, `keys()` / `getAll()`
- **[Drivers](../drivers/)**, **[Local storage](../local-storage/)**, **[Session storage](../session-storage/)**, **[Runtime](../runtime/)**, **[IndexedDB](../indexeddb/)** — driver internals
- **[Custom drivers](../custom-drivers/)** — implementing `CacheDriverInterface`
- **[Encryption](../encryption/)**, **[Encrypted cache](../encrypted-cache/)** — opaque-at-rest values
- **[Recipes](../recipes/)** — common patterns
