---
name: mongez-cache-encryption
description: Documents EncryptedLocalStorageDriver and EncryptedSessionStorageDriver — how to wire an encrypt/decrypt pair, rotate keys, bring custom encryption, and the known TTL bug on encrypted drivers.
when_to_use: User imports EncryptedLocalStorageDriver or EncryptedSessionStorageDriver from @mongez/cache, asks about storing auth tokens or PII encrypted in localStorage, key rotation for cached values, or using @mongez/encryption with @mongez/cache.
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

## Known bug

`EncryptedLocalStorageDriver.set` ignores `expiresAfter`. The plain drivers wrap every value in `{data, expiresAt}` and respect per-entry TTL; the encrypted variant writes only the cypher and skips the envelope. As a consequence, encrypted entries never expire automatically — `cache.set("token", value, 60)` on an encrypted driver stores `value` indefinitely.

Workaround: store the TTL inside the value yourself.

```ts
cache.set("token", { value: rawToken, expiresAt: Date.now() + 60_000 });

function readTokenOrNull() {
  const entry = cache.get("token");
  if (!entry || entry.expiresAt < Date.now()) {
    cache.remove("token");
    return null;
  }
  return entry.value;
}
```

The skipped test lives at `src/__tests__/encrypted-local-storage.test.ts` — re-enable after fixing.

## Gotchas

- **Encryption is opt-in storage cost.** Cypher payloads are larger than plaintext. Worse-case localStorage entries can run out of quota faster.
- **The encrypt function must handle all the value shapes you pass to `set`.** If you pass objects, the encrypt function must serialize. `@mongez/encryption`'s `encrypt` JSON-wraps internally; custom pairs may not.
- **A failed decrypt returns `null` from `@mongez/encryption`.** Treat `null` as a "missing or tampered" sentinel and re-issue rather than panicking. (Other decrypt implementations may throw — wrap accordingly.)
