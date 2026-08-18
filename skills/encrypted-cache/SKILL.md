---
name: mongez-cache-encrypted-cache
description: |
  End-to-end setup for `EncryptedLocalStorageDriver`, `EncryptedSessionStorageDriver` and `EncryptedIndexedDBDriver` — wiring `@mongez/encryption` (async in 2.x) or a custom encrypt/decrypt pair, key rotation, prefix, TTL behavior, and persisting `@mongez/atom` with encrypted storage at rest.
---

# @mongez/cache — Encrypted Storage

## How to use

### Install

```sh
yarn add @mongez/cache @mongez/encryption
```

`@mongez/encryption` (`^2.0.0`) is a peer dependency needed only for the encrypted drivers. You may supply your own encrypt/decrypt pair (sync or async) if you prefer.

### Full setup with @mongez/encryption

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

// 1. Configure the encryption key once at boot.
setEncryptionConfigurations({ key: "your-app-secret" });

// 2. Pass the driver and the encrypt/decrypt pair to the cache.
setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: {
    encrypt,
    decrypt,
  },
});
```

From this point the `cache` API is identical to the plain drivers, apart from `await`:

```ts
import cache from "@mongez/cache";

await cache.set("token", "abc123");
// localStorage: { "token": "<AES-GCM cyphertext>" }

await cache.get("token");   // "abc123"  ← decrypted transparently
```

### Encrypted sessionStorage variant

Replace the driver; everything else is identical:

```ts
import { EncryptedSessionStorageDriver, setCacheConfigurations } from "@mongez/cache";
import { encrypt, decrypt, setEncryptionConfigurations } from "@mongez/encryption";

setEncryptionConfigurations({ key: "your-app-secret" });

setCacheConfigurations({
  driver: new EncryptedSessionStorageDriver(),
  encryption: { encrypt, decrypt },
});
```

### Encrypted IndexedDB variant (opt-in)

For structured values or storage beyond the ~5MB Web Storage quota, `EncryptedIndexedDBDriver` encrypts the whole `{data, expiresAt}` envelope while keeping a plaintext `expiresAt` on the record so expired rows can be evicted without decrypting every entry on GC. See the `indexeddb` skill for driver options and error types.

```ts
import { EncryptedIndexedDBDriver, setCacheConfigurations } from "@mongez/cache";
import { encrypt, decrypt, setEncryptionConfigurations } from "@mongez/encryption";

setEncryptionConfigurations({ key: "your-app-secret" });

setCacheConfigurations({
  driver: new EncryptedIndexedDBDriver(),
  encryption: { encrypt, decrypt },
});

await cache.set("auth.tokens", { access, refresh }, 60 * 30);
```

### Bringing your own encrypt/decrypt pair

Any object with `encrypt(value: any): any | Promise<any>` and `decrypt(value: any): any | Promise<any>` is valid. The pair is called (and `await`ed) on every `set` and `get`:

```ts
import { EncryptedLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";
import CryptoJS from "crypto-js";

const SECRET = "app-secret";

setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: {
    encrypt: (value) =>
      CryptoJS.AES.encrypt(JSON.stringify(value), SECRET).toString(),
    decrypt: (value) => {
      const bytes = CryptoJS.AES.decrypt(value, SECRET);
      return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    },
  },
});
```

### TTL with encrypted drivers

The encrypted drivers wrap values in the same `{data, expiresAt}` envelope as the plain drivers before encrypting. TTL works identically:

```ts
await cache.set("token", "abc123", 60 * 15);  // expires in 15 minutes

// On disk: encrypted({ data: "abc123", expiresAt: <timestamp> })
// On get after expiry: entry is removed, defaultValue is returned.
```

Set a global default in `setCacheConfigurations`:

```ts
setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: { encrypt, decrypt },
  expiresAfter: 60 * 60,  // 1-hour default
});
```

### Key prefixing

Works the same as plain drivers:

```ts
setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: { encrypt, decrypt },
  prefix: "secure-",
});

await cache.set("user", { id: 1 });
// localStorage key: "secure-user", value: ciphertext
await cache.get("user");  // { id: 1 }
```

### Rotating the encryption key

Because the encrypt/decrypt pair is read from configuration on every call, you can rotate the key without rebuilding driver instances:

```ts
import { setEncryptionConfigurations } from "@mongez/encryption";
import { setCacheConfigurations, getCacheConfigurations } from "@mongez/cache";

// Rotate the @mongez/encryption key:
setEncryptionConfigurations({ key: "new-secret" });

// Re-apply config to pick up the new functions:
const existing = getCacheConfigurations();
setCacheConfigurations({
  ...existing,
  encryption: { encrypt, decrypt }, // encrypt/decrypt close over the new key
} as any);
```

Note: existing ciphertext written with the old key cannot be decrypted after rotation — it fails authentication and is evicted on the next read rather than thrown. Clear the cache or migrate entries before rotating in production.

### Wiring to @mongez/atom with encrypted storage

Tokens and PII stored through `@mongez/atom` persist automatically using encrypted storage when you use an encrypted driver in the shared cache adapter:

```ts
// adapters/cacheAdapter.ts
import cache from "@mongez/cache";

export const secureAdapter = {
  get:    (key: string) => cache.get(key),
  set:    (key: string, value: unknown) => cache.set(key, value),
  remove: (key: string) => cache.remove(key),
};
```

```ts
import { createAtom } from "@mongez/atom";
import { secureAdapter } from "./adapters/cacheAdapter";

const authAtom = createAtom({
  key: "auth.token",
  default: null,
  persist: secureAdapter,
});
```

Because the adapter delegates to the cache which uses an encrypted driver, all atom values are transparently encrypted at rest.

## Key details / Pitfalls

- **`encryption` key in `setCacheConfigurations` is mandatory.** Without it, `getCacheConfig("encryption")` returns `undefined` and the driver will throw a runtime error on `set` or `get`. Always pass `{ encrypt, decrypt }`.
- **The `encryption` pair is called with the raw envelope object before JSON-stringification.** The driver passes `{ data: value, expiresAt }` directly to `encrypt`. Your `encrypt` function receives a plain object, not a string, and may return a value or a `Promise`.
- **`clear()` is scoped to the configured prefix; with no prefix, it wipes the entire backing store.** Use `remove(key)` for targeted deletion, or set a `prefix` on shared domains.
- **Legacy ciphertext (pre-envelope format) is handled gracefully.** If a stored ciphertext decrypts to something without `data`/`expiresAt` keys (i.e. written before the envelope was introduced), the driver returns the decrypted value as-is with no expiry check. This prevents data loss during upgrades.
- **A tampered or undecryptable entry is evicted, not thrown.** If the ciphertext is corrupted or the key has been rotated, `get()` removes the entry and resolves to `defaultValue` rather than throwing — a single poisoned row cannot make every later read fail.
- **Do not mix plain and encrypted drivers on the same key.** Reading a plaintext envelope with an encrypted driver (or vice versa) resolves to `null` / default, not an error. Clear stale entries after switching drivers.
- **`EncryptedSessionStorageDriver` has tab-lifetime persistence.** Use `EncryptedLocalStorageDriver` or `EncryptedIndexedDBDriver` when you need values to survive tab close and reopen.
