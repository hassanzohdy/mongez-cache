---
name: mongez-cache-overview
description: |
  Pitch, install, mental model, and the full public surface of `@mongez/cache` — the `cache` singleton, `CacheManager`, `BaseCacheEngine`, the plain / encrypted / runtime drivers, configuration helpers (`setCacheConfigurations`, `getCacheConfigurations`, `getCacheConfig`), and `CacheDriverInterface` / `CacheManagerInterface` / `CacheConfigurations` types.
  TRIGGER when: a new file pulls in `@mongez/cache` for the first time or runs `yarn add @mongez/cache`; user asks "what is `@mongez/cache`", "should I use this over raw `localStorage`", or "what drivers ship with `@mongez/cache`"; `import cache, { ... } from "@mongez/cache"`.
  SKIP: deep dives on a specific driver — use `mongez-cache-local-storage`, `mongez-cache-session-storage`, `mongez-cache-runtime`, or `mongez-cache-encryption`; bootstrap / configuration mechanics — use `mongez-cache-manager` or `mongez-cache-drivers`; copy-paste recipes — use `mongez-cache-recipes`.
---

# @mongez/cache — Overview

## When to use

Use this skill when someone wants to understand:

- What `@mongez/cache` is and what problem it solves.
- Which storage backends (drivers) are available.
- Whether to reach for this package instead of `window.localStorage` directly.
- How it fits into the broader Mongez family (`@mongez/atom`, `@mongez/encryption`).

## How to use

### What it is

`@mongez/cache` is a framework-agnostic cache facade. It wraps `localStorage`, `sessionStorage`, and an in-memory map behind a single `cache.set / cache.get / cache.remove / cache.clear` interface. You choose a backend once at boot time; every call site stays the same regardless of which driver is active.

Install:

```sh
yarn add @mongez/cache
# add @mongez/encryption only when using the encrypted drivers
```

### Available drivers

| Driver | Module export | Persistence | Notes |
|---|---|---|---|
| `PlainLocalStorageDriver` | named | Cross-session (survives reload) | JSON-serialized; supports TTL envelope |
| `PlainSessionStorageDriver` | named | Tab-lifetime only | Same contract as local-storage variant |
| `EncryptedLocalStorageDriver` | named | Cross-session | Runs values through a configurable encrypt/decrypt pair before writing |
| `EncryptedSessionStorageDriver` | named | Tab-lifetime | Encrypted sessionStorage variant |
| `RunTimeDriver` | named | In-memory; lost on reload | No Web Storage dependency — safe for SSR and tests |

All drivers implement `CacheDriverInterface` and can be used directly or through the `CacheManager` singleton.

### When to choose @mongez/cache over raw Web Storage

- You need TTL (per-entry expiry) without rolling your own timestamp envelope.
- You want key prefixing so multiple apps on the same domain cannot collide.
- You want to swap backends (e.g. switch to `RunTimeDriver` in tests, `EncryptedLocalStorageDriver` in production) without touching call sites.
- You need encrypted-at-rest values without writing serialization boilerplate.
- You are using `@mongez/atom` and want its `persist` slot backed by localStorage/sessionStorage.

### Exported surface

```ts
import cache, {
  CacheManager,
  PlainLocalStorageDriver,
  PlainSessionStorageDriver,
  EncryptedLocalStorageDriver,
  EncryptedSessionStorageDriver,
  RunTimeDriver,
  BaseCacheEngine,
  setCacheConfigurations,
  getCacheConfigurations,
  getCacheConfig,
} from "@mongez/cache";

import type {
  CacheDriverInterface,
  CacheManagerInterface,
  CacheConfigurations,
} from "@mongez/cache";
```

`cache` (the default export) is a pre-built `CacheManager` singleton. Configure it once; import it anywhere.

## Key details / Pitfalls

- **`setCacheConfigurations` must be called before first use.** The singleton's driver is `undefined` until you call it. Calling `cache.set(...)` before configuring throws.
- **Web Storage drivers throw on the server** (`localStorage` does not exist in Node). Gate driver selection with `typeof window === "undefined"` and fall back to `RunTimeDriver` for SSR paths.
- **`RunTimeDriver` is not shared.** Two instances have independent stores. There is no global in-memory registry.
- **`has(key)` on `RunTimeDriver` has a known bug**: it may return `true` for missing keys in some versions (base engine checks `!== null`, but missing keys return `undefined`). Use `get(key) !== null` as a workaround when targeting that driver.
- **Related packages**: `@mongez/atom` (state atoms with a `persist` slot), `@mongez/encryption` (CryptoJS-backed encrypt/decrypt for the encrypted drivers).
