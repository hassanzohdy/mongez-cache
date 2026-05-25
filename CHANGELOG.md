# Changelog — @mongez/cache

## Unreleased

### Fixed

- **`EncryptedLocalStorageDriver.set` now respects `expiresAfter`** (`drivers/EncryptedLocalStorageDriver.ts`). The driver now wraps every value in a `{data, expiresAt}` envelope before encrypting — matching the plain-driver shape — then decrypts and unwraps on read, applying the same expiry check the plain drivers use. The on-disk cypher format is still a single string, so storage layout is unchanged. **Backward compatibility:** legacy cyphers written by previous releases (raw value, no envelope) are still readable — when the decrypted payload doesn't look like the envelope (`typeof !== "object"`, no `data` key), the driver returns the value as-is with no expiration. Inherited by `EncryptedSessionStorageDriver`.
- **`RunTimeDriver.has(missingKey)` now returns `false`** (`drivers/RunTimeDriver.ts`). `RunTimeDriver.getItem` now returns `null` (instead of `undefined`) for misses, aligning the driver with the Web Storage API contract and fixing `BaseCacheEngine.has()` for this driver. The base engine's `has()` check (`getItem(...) !== null`) was already correct for the other drivers; this change brings RunTimeDriver into line.

### Known limitations (intentionally preserved)

- **`CacheConfigurations.valueParer` typo** (`types.ts:67`). The field is named `valueParer` — missing the second `s` in `Parser`. The matching field in `BaseCacheEngine` is `_valueParser` (correctly spelled). External code passing `{ valueParser: ... }` to `setCacheConfigurations` is silently ignored; the typo is preserved here for backward compatibility.
- **`clear()` wipes the entire storage backend, not just keys under the prefix.** `localStorage.clear()` / `sessionStorage.clear()` reset everything in the origin, including data owned by unrelated apps sharing the domain. There is no prefix-scoped variant. Document this prominently at the call site when sharing a domain.

### Added

- **Test suite.** 96 vitest unit tests under happy-dom across `PlainLocalStorageDriver`, `PlainSessionStorageDriver`, `EncryptedLocalStorageDriver`, `EncryptedSessionStorageDriver`, `RunTimeDriver`, `CacheManager`, the configuration helpers, and the public-export surface. Total: 96 passing, 0 skipped.
- **AI kit.** `llms.txt`, `llms-full.txt`, and a `skills/` folder (`README`, `overview`, `manager`, `local-storage`, `session-storage`, `runtime`, `encryption`, `custom-drivers`, `recipes`) for tool-assisted development.
- **CI.** GitHub Actions workflow: Node 18/20/22 on Ubuntu, plus Node 20 on Windows.
- **`vitest.config.ts`** modeled on the `@mongez/dom` pattern. happy-dom environment (the Web Storage drivers need it), self-detecting sibling-alias helper (resolves `@mongez/encryption` from the monorepo when present, falls back to `node_modules` in CI), and a shared `setup.ts` that clears both Web Storage backends between tests.
- **`package.json` fields.** `description` (was generic), `keywords` (expanded with driver names, TTL, prefix, persist-adapter), `sideEffects: false`, `scripts.test`, `scripts.test:watch`, and devDependencies for `happy-dom`, `typescript`, `vitest`.

### Changed

Nothing in the runtime surface.

### Removed

Nothing.

### Tests

```
96 passing, 0 skipped
```

## 1.2.4

(historical — no detailed changelog kept)

## 1.2.0 — 11 Nov 2022

- Removed `@mongez/encryption` from the runtime dependency closure and moved the encrypt/decrypt pair into `setCacheConfigurations({ encryption })`. The encrypted drivers now require an explicit encryption pair in configuration before use.

## 1.1.6 — 07 Nov 2022

- `valueConverter` and `valueParer` accepted in configuration.

## 1.1.0 — 04 Nov 2022

- `RunTimeDriver` for in-memory caching.
- `PlainSessionStorageDriver` and `EncryptedSessionStorageDriver`.
- Per-entry expiration via `set(key, value, expiresAfter)`.
- `getCacheConfigurations` and `getCacheConfig`.
