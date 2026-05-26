---
name: mongez-cache-encryption
description: |
  Reference for `EncryptedLocalStorageDriver` and `EncryptedSessionStorageDriver` — class signatures, wiring an encrypt/decrypt pair via `setCacheConfigurations`, key rotation through `getCacheConfig("encryption")`, bringing-your-own encryptor, and the known TTL bug.
  TRIGGER when: code imports `EncryptedLocalStorageDriver` or `EncryptedSessionStorageDriver` from `@mongez/cache`; user asks "how do encrypted cache drivers work", "what's the encryption pair contract", or "why don't encrypted entries expire"; `import { EncryptedLocalStorageDriver } from "@mongez/cache"`.
  SKIP: full step-by-step encrypted setup with `@mongez/encryption` and atom adapters — use `mongez-cache-encrypted-cache`; plain (unencrypted) drivers — use `mongez-cache-local-storage` / `mongez-cache-session-storage`; daily `cache.set` / `cache.get` usage — use `mongez-cache-basic-usage`.
---

# Encryption

Two drivers — `EncryptedLocalStorageDriver` and `EncryptedSessionStorageDriver` — route values through an encrypt/decrypt pair before reading and writing. The pair is supplied via configuration, so you can rotate it without rebuilding driver instances.

## Signatures

```ts
import {
  EncryptedLocalStorageDriver,
  EncryptedSessionStorageDriver,
} from "@mongez/cache";

class EncryptedLocalStorageDriver extends PlainLocalStorageDriver { ... }
class EncryptedSessionStorageDriver extends EncryptedLocalStorageDriver { ... }
```

Both override `set` and `get` to call `getCacheConfig("encryption")?.encrypt(value)` on write and `decrypt` on read.

## Configuration

The encryption pair is required — drivers throw on the first `set` if it's missing. Wire it via `setCacheConfigurations`:

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
```

## Usage

Identical to the plain drivers from the call site's perspective:

```ts
cache.set("token", "abc");
cache.get("token");                 // "abc"

// On disk:
//   { "token": "U2FsdGVkX1+P5XX...== " }
```

The cypher format depends on the encrypt function you wire in. `@mongez/encryption`'s `encrypt` uses CryptoJS AES with a JSON-wrapped payload (`{data: value}`); the resulting string is what's stored.

## Bringing your own encrypt / decrypt

The pair only needs to round-trip. Anything compatible works:

```ts
setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: {
    encrypt: (value) => myEncrypt(JSON.stringify(value)),
    decrypt: (cypher) => JSON.parse(myDecrypt(cypher)),
  },
});
```

The driver does not JSON-serialize values itself — `encrypt` receives the raw input. If you want strings on disk, your `encrypt` is responsible for serialization.

## When to use it

- **Auth tokens** (access tokens, refresh tokens, session IDs).
- **PII** that would otherwise sit in plaintext localStorage and leak to extensions, devtools snooping, or any script with `window` access.
- **API keys** that you'd rather not see in a network tab's source map.

For non-sensitive data, prefer the plain drivers — encryption is overhead, and storage-bound code paths run on every read.

## Key rotation

Because the encryption pair is looked up via `getCacheConfig("encryption")` on every operation, you can rotate keys without rebuilding driver instances. Update the configuration:

```ts
setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: {
    encrypt: makeEncrypt(newKey),
    decrypt: tryDecrypt(newKey, oldKey),     // attempt both during rollout
  },
});
```

Old entries become unreadable when you drop the old key from `decrypt`. Have a migration plan for sensitive data.

## TTL

`EncryptedLocalStorageDriver.set` respects `expiresAfter`. Values are wrapped in the same `{data, expiresAt}` envelope as the plain drivers before encryption, then decrypted and unwrapped on read with the same expiry check.

```ts
cache.set("token", "abc", 60);     // 60-second TTL — entry is dropped on the next read past the window
```

Backward compatibility: legacy cyphers written before the envelope was introduced (raw value, no `data` key) are still readable. The driver returns the decrypted payload as-is with no expiration when the shape doesn't match the envelope. Coverage lives at `src/__tests__/encrypted-local-storage.test.ts`.

## Gotchas

- **Encryption is opt-in storage cost.** Cypher payloads are larger than plaintext. Worse-case localStorage entries can run out of quota faster.
- **The encrypt function must handle all the value shapes you pass to `set`.** If you pass objects, the encrypt function must serialize. `@mongez/encryption`'s `encrypt` JSON-wraps internally; custom pairs may not.
- **A failed decrypt returns `null` from `@mongez/encryption`.** Treat `null` as a "missing or tampered" sentinel and re-issue rather than panicking. (Other decrypt implementations may throw — wrap accordingly.)
