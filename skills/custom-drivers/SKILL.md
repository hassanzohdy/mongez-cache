---
name: mongez-cache-custom-drivers
description: |
  Build custom async cache backends by extending `BaseCacheEngine` (cookies, remote key/value stores) or implementing `CacheDriverInterface` directly (fully custom async backends) — override `convertValue` / `parseValue` or `set` / `get` when the envelope shape needs to change. IndexedDB now ships in-tree; see the `indexeddb` skill instead of building your own.
---

# Custom drivers

Build a new backend by extending `BaseCacheEngine`. The base class handles the `{data, expiresAt}` envelope, expiration checks, prefix application, JSON conversion, corruption recovery, and lifts a synchronous (or async) `storage` into the same `Promise`-returning contract every driver shares. The subclass only needs to point `storage` at the actual store.

> **Need IndexedDB?** `IndexedDBDriver` / `EncryptedIndexedDBDriver` ship in the package as of 2.0.0 — see the `indexeddb` skill instead of building one. They implement `CacheDriverInterface` directly rather than extending `BaseCacheEngine`, because IndexedDB's transaction model doesn't fit the simple `getItem`/`setItem` shape `BaseCacheEngine` expects.

## Minimum viable driver

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

`storage` mirrors the `Storage` interface from the DOM spec, but you can supply any object with the four methods above — the base engine treats it as opaque, and each method may itself return a `Promise` if the backend is naturally async.

## Cookie driver

```ts
class CookieDriver extends BaseCacheEngine {
  public storage = {
    getItem: (key: string) => {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    },
    setItem: (key: string, value: string) => {
      if (typeof document === "undefined") return;
      document.cookie =
        `${key}=${encodeURIComponent(value)};path=/;max-age=31536000;samesite=lax`;
    },
    removeItem: (key: string) => {
      if (typeof document === "undefined") return;
      document.cookie = `${key}=;path=/;max-age=0`;
    },
    clear: () => {
      /* enumerate document.cookie and expire each */
    },
  };
}
```

Cookies are SSR-friendly when the server can read the request's `Cookie` header — for that path, wrap the same shape around your framework's server-side cookie API.

## A fully async remote store

`BaseCacheEngine`'s `read` / `write` / `delete` helpers already lift `storage.getItem` / `setItem` / `removeItem` into a `Promise`, so an async backend (an HTTP KV API, a remote cache service) plugs in the same way — just return a `Promise` from the storage methods:

```ts
class RemoteDriver extends BaseCacheEngine {
  public storage = {
    getItem: (key: string) => fetch(`/api/cache/${key}`).then(r => r.ok ? r.text() : null),
    setItem: (key: string, value: string) => fetch(`/api/cache/${key}`, { method: "PUT", body: value }).then(() => {}),
    removeItem: (key: string) => fetch(`/api/cache/${key}`, { method: "DELETE" }).then(() => {}),
    clear: () => fetch("/api/cache", { method: "DELETE" }).then(() => {}),
  };
}
```

For backends whose transaction model doesn't fit `getItem`/`setItem`/`removeItem`/`clear` at all (IndexedDB's cursor-based bulk reads, for example), implement `CacheDriverInterface` directly instead of extending `BaseCacheEngine` — `IndexedDBDriver` is the in-tree reference for this pattern.

## Override the envelope shape

`RunTimeDriver` is the in-tree example of a driver that doesn't want JSON. It overrides both:

```ts
class RunTimeDriver extends BaseCacheEngine {
  public storage = this;
  public data = new Map<string, { value: any; expiresAt?: number }>();

  public getItem(key: string, defaultValue?: any) { /* ... */ }
  public setItem(key: string, value: any) { /* ... */ }
  public removeItem(key: string) { /* ... */ }

  protected convertValue(value: any) { return value; }   // no JSON.stringify
  protected parseValue(value: any) { return value; }     // no JSON.parse

  public async clear() { this.data.clear(); return this; }
}
```

Override `convertValue` and `parseValue` whenever your storage backend already accepts structured data — an in-memory map, a binary protocol, etc. The base engine still wraps in `{data, expiresAt}` so TTL keeps working.

## Override `set` / `get` entirely

The encrypted drivers go one step further — they override `set` and `get` themselves to route values through the encrypt/decrypt pair, `await`ing both. They still wrap in the `{data, expiresAt}` envelope before encrypting, so TTL keeps working. That pattern is the right move when:

- You need to transform the entire value (encrypt, compress, sign), not just the on-disk format.
- You're willing to re-implement the envelope yourself if you also need TTL.

```ts
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

If you override `set` and skip the envelope, you also lose TTL. Add your own expiry mechanism if needed (a per-key `${key}.expiresAt` companion entry, or fold the timestamp into the compressed payload).

## Wiring it up

```ts
setCacheConfigurations({
  driver: new MyDriver(),
});

await cache.set("name", "Hasan");
```

Or use it directly without going through `setCacheConfigurations`:

```ts
const driver = new MyDriver();
await driver.set("name", "Hasan");
```
