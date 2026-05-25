---
name: mongez-cache-drivers
description: How to configure each @mongez/cache driver — localStorage, sessionStorage, runtime memory — including prefix, global TTL, and custom serialization.
when_to_use: User wants to configure a cache driver, set a prefix or default TTL, swap drivers at runtime, build a custom driver, or needs SSR-safe driver selection.
---

# @mongez/cache — Driver Configuration

## When to use

Use this skill when someone needs to:

- Choose and instantiate a specific driver (`PlainLocalStorageDriver`, `PlainSessionStorageDriver`, `RunTimeDriver`).
- Call `setCacheConfigurations` with the right options.
- Set a global key prefix or a default TTL.
- Supply custom serialization (non-JSON encoders).
- Select a driver conditionally for SSR.
- Build a custom driver by extending `BaseCacheEngine`.

## How to use

### Bootstrapping — `setCacheConfigurations`

Call this once, early (e.g. in your app entry point), before any `cache.*` call.

```ts
import cache, {
  PlainLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "myapp-",       // prepended to every key on disk
  expiresAfter: 60 * 60,  // 1-hour default TTL (seconds); omit for no expiry
});
```

Full `CacheConfigurations` type:

```ts
type CacheConfigurations = {
  driver: CacheDriverInterface;
  prefix?: string;
  expiresAfter?: number;                       // seconds; default is Infinity (no expiry)
  valueConverter?: (value: any) => any;        // replaces JSON.stringify
  valueParer?: (value: any) => any;            // replaces JSON.parse  (note: typo in type name is intentional)
  encryption?: {
    encrypt: (value: any) => any;
    decrypt: (value: any) => any;
  };
};
```

### PlainLocalStorageDriver

Reads and writes `window.localStorage`. Values are wrapped in a `{data, expiresAt}` JSON envelope before storage.

```ts
import { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",
  expiresAfter: 60 * 60 * 24, // 24 hours
});
```

### PlainSessionStorageDriver

Identical contract to `PlainLocalStorageDriver` but backed by `window.sessionStorage`. Data is lost when the tab is closed.

```ts
import { PlainSessionStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainSessionStorageDriver(),
  prefix: "wizard-",
});
```

### RunTimeDriver

In-memory map. No Web Storage dependency — safe for tests and SSR. Data is gone when the page reloads or the process exits.

```ts
import { RunTimeDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new RunTimeDriver() });
```

Two `RunTimeDriver` instances are independent: they do not share any global store.

### SSR-safe driver selection

`localStorage` and `sessionStorage` do not exist in Node. Gate driver selection:

```ts
import { PlainLocalStorageDriver, RunTimeDriver, setCacheConfigurations } from "@mongez/cache";

const driver =
  typeof window === "undefined"
    ? new RunTimeDriver()
    : new PlainLocalStorageDriver();

setCacheConfigurations({ driver, prefix: "ssr-" });
```

### Custom serialization

The default encoder/decoder is `JSON.stringify` / `JSON.parse`. Override globally:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  valueConverter: (v) => mySerialize(v),
  valueParer:     (v) => myDeserialize(v),   // note: key is `valueParer` (single r), not `valueParser`
});
```

Or per driver instance (chainable):

```ts
const driver = new PlainLocalStorageDriver();
driver
  .setValueConverter((v) => mySerialize(v))
  .setValueParser((v) => myDeserialize(v));
```

### Multiple CacheManager instances

The default `cache` export is a singleton. For isolated concerns (e.g. session state vs. long-lived prefs), create a second manager:

```ts
import { CacheManager, PlainSessionStorageDriver, PlainLocalStorageDriver } from "@mongez/cache";

const sessionCache = new CacheManager();
sessionCache.setDriver(new PlainSessionStorageDriver());
sessionCache.setPrefixKey("session-");

const prefsCache = new CacheManager();
prefsCache.setDriver(new PlainLocalStorageDriver());
prefsCache.setPrefixKey("prefs-");
```

### Building a custom driver

Extend `BaseCacheEngine` and point `storage` at any object that exposes `getItem / setItem / removeItem / clear`. The base class handles the expiry envelope, prefix, and corruption recovery.

```ts
import { BaseCacheEngine } from "@mongez/cache";

class CookieDriver extends BaseCacheEngine {
  public storage = {
    getItem:    (k: string) => getCookie(k) ?? null,
    setItem:    (k: string, v: string) => setCookie(k, v),
    removeItem: (k: string) => deleteCookie(k),
    clear:      () => clearAllCookies(),
  };
}

setCacheConfigurations({ driver: new CookieDriver() });
```

## Key details / Pitfalls

- **`setCacheConfigurations` is not idempotent in every case.** It merges into an internal `configuration` object, but the `prefix` and serializers are applied to the driver directly when the call is made. Calling it a second time with a new driver will push new config to the new driver, not re-apply the old prefix.
- **`prefix` affects the raw storage key, not the key you pass to `get/set`.** Pass the bare key to all methods; the prefix is injected automatically.
- **`expiresAfter: 0` disables expiry** (falsy check in the base engine). Use `undefined` or omit the key to get the same result.
- **`valueParer` is misspelled** in the `CacheConfigurations` type (one `r`). Use `valueParer` — not `valueParser` — when passing it to `setCacheConfigurations`. The per-driver method is correctly named `setValueParser`.
- **Encrypted drivers require the `encryption` key in `setCacheConfigurations`.** Without it, `encrypt` / `decrypt` are `undefined` and the driver will throw. See the `encrypted-cache` skill for the full setup.
