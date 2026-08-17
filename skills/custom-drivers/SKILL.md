---
name: mongez-cache-custom-drivers
description: |
  Build custom cache backends by extending `BaseCacheEngine` — IndexedDB, cookies, remote stores — and override `convertValue` / `parseValue` or `set` / `get` when the envelope shape needs to change.
---

# Custom drivers

Build a new backend by extending `BaseCacheEngine`. The base class handles the `{data, expiresAt}` envelope, expiration checks, prefix application, JSON conversion, and corruption recovery. The subclass only needs to point `storage` at the actual store.

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

`storage` mirrors the `Storage` interface from the DOM spec, but you can supply any object with the four methods above. The base engine treats it as opaque.

## Indexed DB

```ts
import { BaseCacheEngine } from "@mongez/cache";
import { get, set, del, clear } from "idb-keyval";

class IndexedDbDriver extends BaseCacheEngine {
  public storage = {
    getItem: (key: string) => /* IDB is async — see notes below */,
    setItem: (key: string, value: string) => {
      set(key, value);                 // fire-and-forget
    },
    removeItem: (key: string) => {
      del(key);
    },
    clear: () => {
      clear();
    },
  };
}
```

**Async caveat**: the `BaseCacheEngine.get` expects a synchronous return from `storage.getItem`. IndexedDB is inherently async. If you need real IndexedDB-backed reads, either:

1. Maintain an in-memory mirror that you populate from IDB on boot, read synchronously from the mirror, and write through to IDB on `setItem`.
2. Use `@mongez/atom`'s `persist` slot directly — it accepts async adapters. See [`recipes.md`](./recipes.md).

For most apps, option 2 is simpler.

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

## Override the envelope shape

`RunTimeDriver` is the in-tree example of a driver that doesn't want JSON. It overrides both:

```ts
class RunTimeDriver extends BaseCacheEngine {
  public storage = this;
  public data: Record<string, { value: any; expiresAt?: number }> = {};

  public getItem(key: string, defaultValue?: any) { /* ... */ }
  public setItem(key: string, value: any) { /* ... */ }
  public removeItem(key: string) { /* ... */ }

  protected convertValue(value: any) { return value; }   // no JSON.stringify
  protected parseValue(value: any) { return value; }     // no JSON.parse

  public clear() { this.data = {}; return this; }
}
```

Override `convertValue` and `parseValue` whenever your storage backend already accepts structured data — IndexedDB, an in-memory map, a binary protocol, etc. The base engine still wraps in `{data, expiresAt}` so TTL keeps working.

## Override `set` / `get` entirely

The encrypted drivers go one step further — they override `set` and `get` themselves to route values through the encrypt/decrypt pair. They still wrap in the `{data, expiresAt}` envelope before encrypting, so TTL keeps working. That pattern is the right move when:

- You need to transform the entire value (encrypt, compress, sign), not just the on-disk format.
- You're willing to re-implement the envelope yourself if you also need TTL.

```ts
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

If you override `set` and skip the envelope, you also lose TTL. Add your own expiry mechanism if needed (a per-key `${key}.expiresAt` companion entry, or fold the timestamp into the compressed payload).

## Wiring it up

```ts
setCacheConfigurations({
  driver: new MyDriver(),
});

cache.set("name", "Hasan");
```

Or use it directly without going through `setCacheConfigurations`:

```ts
const driver = new MyDriver();
driver.set("name", "Hasan");
```
