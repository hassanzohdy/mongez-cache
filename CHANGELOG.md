# Changelog — @mongez/cache

## [2.0.0] — 2026-08-18

Major release. **Every driver method that touches storage is now async** — see Breaking below. Adds two new, opt-in IndexedDB-backed drivers.

### Breaking

- **The driver contract is now async.** `CacheDriverInterface.set/get/has/remove/clear` (and the new `keys`/`getAll`, see Added) all return a `Promise` — `CacheManager`'s facade methods do too. Web Storage and `RunTimeDriver` still do their work synchronously under the hood and simply resolve immediately, so a single `await` (or `.then`) at each call site is the whole migration for those backends:

  ```diff
  - const value = cache.get("name");
  + const value = await cache.get("name");
  ```

  `has()` on the plain drivers also now agrees with `get()` on expiry — it evicts an expired entry and reports `false` instead of reporting `true` and letting the next `get()` silently make it disappear.
- **`@mongez/encryption` bumped to `^2.0.0`.** Its `encrypt`/`decrypt` moved to WebCrypto AES-256-GCM and are now async (a sync `1.x` pair still works — the drivers `await` whatever is returned). `EncryptedLocalStorageDriver`/`EncryptedSessionStorageDriver` `set`/`get` are async for the same reason.

### Added

- **`IndexedDBDriver` and `EncryptedIndexedDBDriver`** (`src/drivers/IndexedDBDriver.ts`, `src/drivers/EncryptedIndexedDBDriver.ts`) — new, **opt-in** drivers (nothing constructs one for you; the default driver is unchanged). Single object store, out-of-line keys, structured-clone values (no JSON pass), a memoized connection so concurrent calls share one `open()`, `onblocked`/`onversionchange` handling, an `onUpgrade` migration hook, quota-error wrapping (`CacheQuotaExceededError`), and prefix-scoped `keys()`/`getAll()`/`clear()`. `EncryptedIndexedDBDriver` encrypts the whole record envelope while keeping a plaintext `expiresAt` for eviction without decrypting every row on GC.
- **`getAll()`** added to `CacheDriverInterface`, `BaseCacheEngine` and `CacheManager` — reads every live (non-expired) entry owned by the driver as a single `{ key: value }` object, reachable the same way on every driver (`cache.getAll()`), not just the IndexedDB ones.
- **`keys()`** added to `CacheDriverInterface` / `CacheManager` — lists the caller-facing keys owned by the active driver (prefix stripped).
- **`errors.ts`** — `IndexedDBUnavailableError`, `CacheQuotaExceededError`, `IndexedDBBlockedError`, exported from the package root.

### Security

- **Prototype-pollution guard on bulk reads.** `getAll()` is the one place a stored key becomes an object property again, and cache keys are attacker-reachable (anything sharing the origin can write into IndexedDB). Every `getAll()` implementation builds onto a null-prototype object and routes `__proto__`/`constructor`/`prototype` keys through `Object.defineProperty` instead of bracket assignment, so a poisoned key round-trips as inert data instead of reaching a prototype setter.
- **TTL-tamper protection in `EncryptedIndexedDBDriver`.** `expiresAt` is kept in the clear (so GC doesn't have to decrypt every row) but is also sealed inside the encrypted, authenticated envelope. `get()` always re-checks the authenticated copy, so editing the plaintext `expiresAt` to extend a TTL buys an attacker nothing — it only self-evicts the tampered row when shortened. A decrypt/auth failure (tampered cypher, rotated key) is treated as a miss and the poisoned entry is evicted, matching the 1.4.0 fix for `EncryptedLocalStorageDriver`.

### Fixed

- **`getCacheConfig` no longer widens its return type to a union of every config value.** It's now generic over `keyof CacheConfigurations`, so `getCacheConfig("encryption")` narrows to `CacheEncryptionConfigurations | undefined` instead of `string | number | CacheDriverInterface | ...`. Pre-existing since `1.1.0`; only surfaced once the package was checked under `--strict` for the first time (new `tsconfig.json`, no build step is added, `yarn test` is unaffected).

### Migration from 1.x

1. `await` every call: `cache.set/get/has/remove/clear/keys/getAll` all return promises now.
2. If you read `getCacheConfig("encryption")` directly, its return type is now correctly narrowed — no code change needed unless you were relying on the looser inferred type.
3. IndexedDB is **not** the default driver — existing `localStorage`/`sessionStorage`/`RunTimeDriver` consumers need no driver change at all. Opt into `IndexedDBDriver`/`EncryptedIndexedDBDriver` explicitly via `setCacheConfigurations({ driver: new IndexedDBDriver() })` if you want them.

## [1.4.0] — 2026-08-17

Security release. **`RunTimeDriver.data` changed from a plain object to a `Map`** — see Breaking below; it is a minor bump because the field is an implementation detail of the driver, but anyone who reached into it directly must change their code.

### Breaking

- **`RunTimeDriver.data` is now a `Map<string, any>` instead of a plain object** (`src/drivers/RunTimeDriver.ts`). This is the fix, not a refactor: cache keys are caller-controlled, and on a plain object the keys `__proto__`, `constructor` and `toString` resolve through the prototype chain. That made `has("constructor")` report `true` with nothing ever stored, `set("__proto__", value)` write to the object's prototype rather than the store, and `remove("__proto__")` a silent no-op — so a key derived from user input could shadow or corrupt cache state, and in the `__proto__` case reach `Object.prototype` itself. A `Map` has no prototype-chain lookup, so every key is plain data.

  **Migration:** the public driver API (`get` / `set` / `has` / `remove` / `clear`) is unchanged. Only direct access to the field moves: `driver.data[key]` → `driver.data.get(key)`, `driver.data[key] = v` → `driver.data.set(key, v)`, `Object.keys(driver.data)` → `[...driver.data.keys()]`, `delete driver.data[key]` → `driver.data.delete(key)`. Tests that asserted on `data` as an object are the most likely callers.

### Security

- **`clear()` is now scoped to the engine's prefix** (`src/drivers/BaseCacheEngine.ts:190`). It called `storage.clear()`, which wipes **the entire origin's** localStorage / sessionStorage — every other app, widget or tool sharing that origin, including auth state belonging to something else entirely. A cache clearing its own entries has no business doing that. When a prefix is configured, only keys carrying it are removed; when none is configured the engine owns the whole namespace, so the historical full-wipe behaviour is kept.
- **Tampered encrypted entries no longer surface as a decrypt throw** (`src/drivers/EncryptedLocalStorageDriver.ts:78`, inherited by `EncryptedSessionStorageDriver`). Cache values live in storage the user (or any script on the origin) can edit, so a corrupted or deliberately-modified cypher was routine and made `get()` throw from a code path callers reasonably treat as infallible — turning a poisoned cache entry into an availability problem that persisted until storage was cleared by hand. `get()` now removes the offending entry and returns the default value, so the next read repopulates cleanly.

## [1.3.4] — 2026-05-26

### Fixed

- **`EncryptedLocalStorageDriver.set` now respects `expiresAfter`** (`drivers/EncryptedLocalStorageDriver.ts`). The driver now wraps every value in a `{data, expiresAt}` envelope before encrypting — matching the plain-driver shape — then decrypts and unwraps on read, applying the same expiry check the plain drivers use. The on-disk cypher format is still a single string, so storage layout is unchanged. **Backward compatibility:** legacy cyphers written by previous releases (raw value, no envelope) are still readable — when the decrypted payload doesn't look like the envelope (`typeof !== "object"`, no `data` key), the driver returns the value as-is with no expiration. Inherited by `EncryptedSessionStorageDriver`.
- **`RunTimeDriver.has(missingKey)` now returns `false`** (`drivers/RunTimeDriver.ts`). `RunTimeDriver.getItem` now returns `null` (instead of `undefined`) for misses, aligning the driver with the Web Storage API contract and fixing `BaseCacheEngine.has()` for this driver. The base engine's `has()` check (`getItem(...) !== null`) was already correct for the other drivers; this change brings RunTimeDriver into line.

### Added

- **Test suite.** 96 vitest unit tests under happy-dom across `PlainLocalStorageDriver`, `PlainSessionStorageDriver`, `EncryptedLocalStorageDriver`, `EncryptedSessionStorageDriver`, `RunTimeDriver`, `CacheManager`, the configuration helpers, and the public-export surface. Total: 96 passing, 0 skipped.
- **AI kit.** `llms.txt`, `llms-full.txt`, and a `skills/` folder (`README`, `overview`, `manager`, `local-storage`, `session-storage`, `runtime`, `encryption`, `custom-drivers`, `recipes`) for tool-assisted development.
- **CI.** GitHub Actions workflow: Node 18/20/22 on Ubuntu, plus Node 20 on Windows.
- **`vitest.config.ts`** modeled on the `@mongez/dom` pattern. happy-dom environment (the Web Storage drivers need it), self-detecting sibling-alias helper (resolves `@mongez/encryption` from the monorepo when present, falls back to `node_modules` in CI), and a shared `setup.ts` that clears both Web Storage backends between tests.
- **`package.json` fields.** `description` (was generic), `keywords` (expanded with driver names, TTL, prefix, persist-adapter), `sideEffects: false`, `scripts.test`, `scripts.test:watch`, and devDependencies for `happy-dom`, `typescript`, `vitest`.

### Tests

```
96 passing, 0 skipped
```

## [1.2.4]

(historical — no detailed changelog kept)

## [1.2.0] — 2022-11-11

- Removed `@mongez/encryption` from the runtime dependency closure and moved the encrypt/decrypt pair into `setCacheConfigurations({ encryption })`. The encrypted drivers now require an explicit encryption pair in configuration before use.

## [1.1.6] — 2022-11-07

- `valueConverter` and `valueParer` accepted in configuration.

## [1.1.0] — 2022-11-04

- `RunTimeDriver` for in-memory caching.
- `PlainSessionStorageDriver` and `EncryptedSessionStorageDriver`.
- Per-entry expiration via `set(key, value, expiresAfter)`.
- `getCacheConfigurations` and `getCacheConfig`.
