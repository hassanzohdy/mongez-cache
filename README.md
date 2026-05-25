# @mongez/cache

> A framework-agnostic cache facade with pluggable drivers — localStorage, sessionStorage, runtime memory, and encrypted variants. One API, key prefixing, TTL per entry, and a shape that drops into `@mongez/atom`'s `persist` slot.

`@mongez/cache` is the storage layer of the Mongez family. It wraps the browser's Web Storage and an in-memory backend behind a single `cache.set(...)` / `cache.get(...)` / `cache.remove(...)` interface. Swap drivers at boot time; the call sites never change.

## Install

```sh
yarn add @mongez/cache
# peer (only when using the encrypted drivers): @mongez/encryption
```

## A 30-second tour

```ts
import cache, {
  PlainLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

// 1. Pick a backend at boot.
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "myapp-",
});

// 2. Use the same API for strings, numbers, arrays, and objects.
cache.set("user", { id: 1, name: "Hasan" });
cache.set("letters", ["a", "b", "c"]);
cache.set("greeting", "Hello");

cache.get("user");          // { id: 1, name: "Hasan" }
cache.get("ghost", "default"); // "default"
cache.has("user");          // true

// 3. Per-entry TTL in seconds.
cache.set("token", "abc123", 60 * 15);   // expires in 15 minutes

// 4. Remove a single key, or wipe everything.
cache.remove("user");
cache.clear();
```

## What's in the box

| Export | Purpose |
|---|---|
| `cache` (default) | A ready-to-use `CacheManager` instance. Configure it once, import it everywhere. |
| `CacheManager` | The facade class that delegates to a driver. |
| `PlainLocalStorageDriver` | Reads/writes `window.localStorage`. JSON-serialized values. |
| `PlainSessionStorageDriver` | Same contract, backed by `window.sessionStorage`. |
| `EncryptedLocalStorageDriver` | localStorage values run through a configurable encrypt/decrypt pair. |
| `EncryptedSessionStorageDriver` | sessionStorage version of the above. |
| `RunTimeDriver` | In-memory map. Forgets everything on reload. Useful for tests and SSR fallbacks. |
| `BaseCacheEngine` | Abstract driver class — extend it to build your own backend. |
| `setCacheConfigurations`, `getCacheConfigurations`, `getCacheConfig` | One-shot configuration helpers. |

## The driver contract

Every driver implements `CacheDriverInterface`:

```ts
type CacheDriverInterface = {
  set(key: string, value: any, expiresAfter?: number): CacheDriverInterface;
  get(key: string, defaultValue?: any): any;
  has(key: string): boolean;
  remove(key: string): CacheDriverInterface;
  clear(): CacheDriverInterface;
  setPrefixKey(key: string): CacheDriverInterface;
  getPrefixKey(): string;
  setValueParser(parser: any): CacheDriverInterface;
  setValueConverter(converter: any): CacheDriverInterface;
};
```

You can hand a driver around directly — the cache manager is a convenience, not a requirement.

```ts
import { PlainLocalStorageDriver } from "@mongez/cache";

const driver = new PlainLocalStorageDriver();
driver.set("name", "Hasan");
driver.get("name");   // "Hasan"
```

## Configuration

`setCacheConfigurations` is the bootstrap call. It accepts the driver plus a few cross-driver knobs:

```ts
type CacheConfigurations = {
  driver: CacheDriverInterface;
  prefix?: string;                                  // prepended to every key
  expiresAfter?: number;                            // seconds; per-entry default
  valueConverter?: (value: any) => any;             // override default JSON.stringify
  valueParer?: (value: any) => any;                 // override default JSON.parse
  encryption?: {
    encrypt: (value: any) => any;
    decrypt: (value: any) => any;
  };
};
```

Reading back:

```ts
import { getCacheConfigurations, getCacheConfig } from "@mongez/cache";

getCacheConfigurations();              // the full record
getCacheConfig("expiresAfter");        // 900
```

## Prefixing keys

Single-app deployments rarely need this. Multi-app, single-domain deployments absolutely do — otherwise `cache.get("user")` in one app picks up the other app's user.

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  prefix: "shop-",
});

cache.set("user", { id: 1 });
// On disk: { "shop-user": "{...}" }
cache.get("user");   // reads back via the bare key
```

## TTL — per call or global

Pass a third argument to `set` for an inline expiry (in seconds):

```ts
cache.set("token", "abc123", 60 * 15);    // 15 minutes
```

Or set a default for every write that omits one:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  expiresAfter: 60 * 60,                  // 1 hour for everything
});

cache.set("user", payload);               // expires in 1 hour
cache.set("session", value, 60);          // overrides to 1 minute
```

Reads of an expired entry return the default and drop the entry from storage.

## Encryption

The encrypted drivers run every value through a configurable encrypt/decrypt pair. Bring your own — `@mongez/encryption` ships a CryptoJS-backed one, but anything with the right shape works.

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

setEncryptionConfigurations({ key: "app-secret" });

setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: { encrypt, decrypt },
});

cache.set("token", "abc");
// On disk: { "token": "U2FsdGVkX18..." }
cache.get("token");   // "abc"
```

The encryption pair is read from configuration on every `set` and `get`, so you can rotate it without rebuilding driver instances.

## Custom serialization

If JSON isn't the right shape for your values (binary blobs, Maps/Sets, BigInt, custom classes), swap the converter and parser:

```ts
setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  valueConverter: (v) => serialize(v),    // your encoder
  valueParer: (v) => deserialize(v),      // your decoder
});
```

Or on a per-driver basis:

```ts
const driver = new PlainLocalStorageDriver();
driver
  .setValueConverter((v) => serialize(v))
  .setValueParser((v) => deserialize(v));
```

## The runtime driver

`RunTimeDriver` is an in-memory backend. Perfect when you need the same call-site shape but a different lifetime (tests, server-rendered pages, ephemeral state):

```ts
import { RunTimeDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({ driver: new RunTimeDriver() });

cache.set("name", "Hasan");
cache.get("name");   // "Hasan"

// Reload the page — gone. That's the point.
```

Two runtime drivers on the same page have independent stores. Drivers don't share memory.

## Building your own driver

Extend `BaseCacheEngine` and point `storage` at anything that exposes `getItem` / `setItem` / `removeItem` / `clear`:

```ts
import { BaseCacheEngine } from "@mongez/cache";

class IndexedDbDriver extends BaseCacheEngine {
  public storage = {
    getItem: (k: string) => /* read from IDB */,
    setItem: (k: string, v: string) => /* write to IDB */,
    removeItem: (k: string) => /* delete from IDB */,
    clear: () => /* drop the store */,
  };
}

setCacheConfigurations({ driver: new IndexedDbDriver() });
```

The base engine handles the expiry envelope, the prefix, JSON conversion, and the corruption-recovery fallback for you.

## Using with @mongez/atom

`@mongez/atom`'s `persist` option accepts any object matching `PersistAdapter<V>`:

```ts
type PersistAdapter<V = unknown> = {
  get(key: string): V | undefined | Promise<V | undefined>;
  set(key: string, value: V): void | Promise<void>;
  remove(key: string): void | Promise<void>;
};
```

`@mongez/cache`'s driver / manager surface satisfies this shape directly — `get`, `set`, and `remove` are the same names with compatible signatures. Drop a cache instance into a `persist` slot and atoms get free localStorage / sessionStorage / encrypted / runtime persistence with whichever driver you configured:

```ts
import { createAtom } from "@mongez/atom";
import cache from "@mongez/cache";

const userAtom = createAtom({
  key: "auth.user",
  default: { name: "Anon" },
  persist: {
    get: (key) => cache.get(key),
    set: (key, value) => cache.set(key, value),
    remove: (key) => cache.remove(key),
  },
});

userAtom.update({ name: "Alice" });
// Next page load — userAtom.value is { name: "Alice" }.
```

The thin wrapper exists so `set` returns `void` rather than the driver (atom doesn't care about the chain, and TypeScript catches the mismatch). For a long-lived shared adapter, pull the wrapper out into its own module:

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

Then atom consumers stay terse:

```ts
import { cacheAdapter } from "./adapters/cacheAdapter";

const themeAtom = createAtom({
  key: "ui.theme",
  default: "light",
  persist: cacheAdapter,
});
```

This pattern composes especially well with the encrypted drivers — your tokens, refresh tokens, and PII end up encrypted on disk without leaking driver details into your atom definitions.

## SSR

The Web-Storage drivers throw on the server because `localStorage` / `sessionStorage` don't exist there. If a code path runs in both environments, gate it:

```ts
const driver = typeof window === "undefined"
  ? new RunTimeDriver()
  : new PlainLocalStorageDriver();

setCacheConfigurations({ driver });
```

Or use a cookie-backed adapter on the server — the contract is small enough that a custom `BaseCacheEngine` subclass takes ~15 lines.

## Cache Manager API

```ts
import cache, { CacheManager } from "@mongez/cache";

// The shipped singleton:
cache.set(...);
cache.get(...);
cache.remove(...);
cache.has(...);
cache.clear();
cache.setPrefixKey("scoped-");
cache.getPrefixKey();
cache.setDriver(newDriver);
cache.getDriver();
cache.setValueParser(parser);
cache.setValueConverter(converter);

// Or build a second manager for a sibling concern (e.g. one for
// "session state", a separate one for "long-lived user prefs"):
const sessionCache = new CacheManager();
sessionCache.setDriver(new PlainSessionStorageDriver());
sessionCache.setPrefixKey("session-");
```

## TypeScript

```ts
import type {
  CacheDriverInterface,
  CacheManagerInterface,
  CacheConfigurations,
} from "@mongez/cache";
```

The driver and manager interfaces use `any` for value parameters — values pass through JSON serialization (or your custom converter), so the type stays open. If you want stronger guarantees per atom, wrap the driver in a typed adapter at the call site.

## Known limitations

These are documented in the test suite with skipped tests so a future maintenance release can address them:

- **`EncryptedLocalStorageDriver` ignores `expiresAfter`.** The plain driver wraps values in `{data, expiresAt}` and respects per-entry TTL; the encrypted driver writes only the cypher and skips the envelope. Encrypted entries never expire automatically. (`drivers/EncryptedLocalStorageDriver.ts:12`)
- **`RunTimeDriver.has(missingKey)` returns `true`.** The base engine's `has()` checks `getItem(key) !== null`, but the runtime driver's `getItem` returns `undefined` for misses. (`drivers/RunTimeDriver.ts:24` / `drivers/BaseCacheEngine.ts:113`)

See the [CHANGELOG](./CHANGELOG.md) for the full list.

## Related packages

| Package | Purpose |
|---|---|
| [`@mongez/atom`](https://github.com/hassanzohdy/atom) | Framework-agnostic state primitive. `persist` slot accepts this package. |
| [`@mongez/encryption`](https://github.com/hassanzohdy/mongez-encryption) | CryptoJS-backed encrypt/decrypt for the encrypted drivers. |
| [`@mongez/dom`](https://github.com/hassanzohdy/dom) | Browser-side DOM utilities. Sister package, similar shape. |

## License

MIT
