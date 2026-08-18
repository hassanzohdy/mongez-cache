---
name: mongez-cache-encryption
description: |
  Reference for `EncryptedLocalStorageDriver`, `EncryptedSessionStorageDriver` and `EncryptedIndexedDBDriver` — class signatures, wiring an async encrypt/decrypt pair via `setCacheConfigurations`, key rotation through `getCacheConfig("encryption")`, bringing-your-own encryptor, TTL via the `{data, expiresAt}` envelope, and legacy-cypher compatibility.
---

# Encryption

Three drivers — `EncryptedLocalStorageDriver`, `EncryptedSessionStorageDriver`, and `EncryptedIndexedDBDriver` — route values through an encrypt/decrypt pair before reading and writing. The pair is supplied via configuration, so you can rotate it without rebuilding driver instances. Both hooks may be synchronous or return a `Promise` — the drivers `await` whatever comes back.

## Signatures

```ts
import {
  EncryptedLocalStorageDriver,
  EncryptedSessionStorageDriver,
  EncryptedIndexedDBDriver,
} from "@mongez/cache";

class EncryptedLocalStorageDriver extends PlainLocalStorageDriver { ... }
class EncryptedSessionStorageDriver extends EncryptedLocalStorageDriver { ... }
class EncryptedIndexedDBDriver extends IndexedDBDriver { ... }
```

All three override `set` and `get` to call `getCacheConfig("encryption")?.encrypt(value)` on write and `decrypt` on read.

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

`@mongez/encryption` `^2.0.0`'s `encrypt`/`decrypt` are async (WebCrypto AES-256-GCM). A synchronous `1.x` pair still works unchanged.

## Usage

Identical to the plain drivers from the call site's perspective, apart from `await`:

```ts
await cache.set("token", "abc");
await cache.get("token");                 // "abc"

// On disk:
//   { "token": "<AES-GCM cyphertext>" }
```

The cypher format depends on the encrypt function you wire in.

## Bringing your own encrypt / decrypt

The pair only needs to round-trip, and may be sync or async. Anything compatible works:

```ts
setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  encryption: {
    encrypt: (value) => myEncrypt(JSON.stringify(value)),
    decrypt: (cypher) => JSON.parse(myDecrypt(cypher)),
  },
});
```

The driver does not JSON-serialize values itself — `encrypt` receives the raw envelope object. If you want strings on disk, your `encrypt` is responsible for serialization.

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
await cache.set("token", "abc", 60);     // 60-second TTL — entry is dropped on the next read past the window
```

`EncryptedIndexedDBDriver` keeps `expiresAt` in the clear on the record too (for eviction without decrypting every row on GC) but re-checks the authenticated copy inside the cypher on every read — tampering with the plaintext value cannot extend the effective TTL.

Backward compatibility: legacy cyphers written before the envelope was introduced (raw value, no `data` key) are still readable. The driver returns the decrypted payload as-is with no expiration when the shape doesn't match the envelope. Coverage lives at `src/__tests__/encrypted-local-storage.test.ts` and `src/__tests__/encrypted-indexeddb-driver.test.ts`.

## Gotchas

- **Every method returns a `Promise`.** `await cache.set/get/has/remove/clear` — required as of 2.0.0, on every encrypted driver including the async encrypt/decrypt call inside them.
- **Encryption is opt-in storage cost.** Cypher payloads are larger than plaintext. Worst-case localStorage entries can run out of quota faster.
- **The encrypt function must handle all the value shapes you pass to `set`.** If you pass objects, the encrypt function must serialize (or accept structured data, for `EncryptedIndexedDBDriver`). `@mongez/encryption`'s `encrypt` handles this internally; custom pairs may not.
- **A tampered or undecryptable entry is evicted, not thrown.** A corrupted cypher, a rotated key, or a failed AES-GCM auth tag makes `get()` remove the offending entry and return the default value — one poisoned row cannot make every later read throw.
