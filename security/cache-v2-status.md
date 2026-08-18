# Cache v2 working-tree audit

Audited by @Nadia (Principal Security Engineer, read-only). Repo:
`D:\xampp\htdocs\mongez\node\@mongez\cache`. Published version: **1.4.0**.
Working tree carries partial, uncommitted work toward **2.0.0** (async
driver contract + IndexedDB driver) left by a worker that timed out after
30 minutes. No edits, reverts, stashes, or commits were made during this
audit — this file is the only new artifact, and it lives outside `src/`.

> Note on `bureau_write_file`: that tool was not present in my toolset, so
> this report was written with the native file-write tool instead.

## 1. Inventory — every changed / added file

### Modified (tracked, uncommitted)

| File | What changed |
|---|---|
| `package.json` | Version `1.4.0` → `2.0.0`; description updated to mention IndexedDB/async; `@mongez/encryption` bumped `^1.0.x` → `^2.0.0`; added devDependency `fake-indexeddb@^6.2.5`; two keywords added (`indexeddb`, `async-cache`). No `engines` field added. No build script (there never was one — package ships raw `src/index.ts`). |
| `src/types.ts` | `CacheDriverInterface` methods (`set`, `get`, `has`, `remove`, `clear`) now return `Promise<...>`; added `keys(): Promise<string[]>` to the interface; added `CacheEncryptionConfigurations`, `IndexedDBDriverOptions`, `IndexedDBUpgradeContext`, `IndexedDBCacheRecord` types; `CacheConfigurations.encryption` now typed via the new `CacheEncryptionConfigurations` (encrypt/decrypt may be sync or async). |
| `src/index.ts` | Exports `EncryptedIndexedDBDriver`, `IndexedDBDriver` (+ its 3 default-const exports), and `export * from "./errors"`. |
| `src/CacheManager.ts` | `set`/`remove`/`clear` now `async` and await the driver; new `keys()` passthrough. `get`/`has` unchanged (already just returned the driver's value/promise). |
| `src/drivers/BaseCacheEngine.ts` | Core rewrite to the async contract: new protected `read`/`write`/`delete` helpers wrap the synchronous Web-Storage/`RunTimeDriver` calls in `Promise.resolve(...)`; `get`, `set`, `has`, `remove`, `clear`, `storageKeys` all made `async`; new `has()` now checks expiry (evicts expired entries, matching `get()` — previously Web Storage engines reported expired keys as present); new `keys()` public method (prefix-aware, prefix-stripped). |
| `src/drivers/PlainLocalStorageDriver.ts` | Doc comment only (explains the async-lift); still just `public storage = localStorage`. |
| `src/drivers/PlainSessionStorageDriver.ts` | Doc comment only; still just `public storage = sessionStorage`. |
| `src/drivers/RunTimeDriver.ts` | `storageKeys()` and `clear()` made `async`, `for...of` over `await this.storageKeys()`. |
| `src/drivers/EncryptedLocalStorageDriver.ts` | `set`/`get`/`remove` made `async`, `await`s `encrypt`/`decrypt` (accommodates `@mongez/encryption` 2.x's async API); new overridden `has()` that checks presence only (no decrypt) — documented tradeoff (avoids paying decrypt cost / silent eviction-as-a-side-effect on a read-shaped call). |
| `src/__tests__/*.test.ts` (7 files) | Updated to `await` the now-async driver/manager calls; net +~500/-~350 lines across the suite. |

### Untracked (new files)

| File | What it does |
|---|---|
| `src/drivers/IndexedDBDriver.ts` | New driver. Single object store, out-of-line keys, `{value, expiresAt}` record, structured-clone values (no JSON pass). Memoized connection promise (concurrent calls share one `open()`), `onblocked`/`onversionchange` handling, `onUpgrade` migration hook, quota-error wrapping, prefix-scoped `keys()`/`getAll()`/`clear()`, cursor-based bulk delete inside one transaction. |
| `src/drivers/EncryptedIndexedDBDriver.ts` | Extends `IndexedDBDriver`. Encrypts the whole `{data, expiresAt}` envelope; keeps a **plaintext** `expiresAt` on the record for eviction without decrypting every row; `get()` treats a decrypt failure (tampered cypher / rotated key / bad auth tag) as a miss and evicts; `getAll()` overridden to decrypt entry-by-entry (base version can't `await` inside a single IDB transaction). |
| `src/drivers/isForbiddenKey.ts` | `FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"]` guard used by bulk-read (`getAll`) rehydration. |
| `src/errors.ts` | `IndexedDBUnavailableError`, `CacheQuotaExceededError` (carries `key` + `cause`), `IndexedDBBlockedError`. |
| `src/__tests__/indexeddb-driver.test.ts` | 36 tests: round-trips, TTL, prefixing, `keys()`/`getAll()`, quota errors, blocked/upgrade handling, and a dedicated prototype-pollution suite (`__proto__`/`constructor`/`prototype` as data, `getAll()` doesn't touch `Object.prototype`). |
| `src/__tests__/encrypted-indexeddb-driver.test.ts` | 11 tests: async encrypt/decrypt round-trip, tampered-record eviction, "poisoned record doesn't affect neighbours," key-rotation self-heal, and **an explicit test that an attacker cannot extend a TTL by editing the plaintext `expiresAt`**. |

### Environment noise (not part of the v2 work — flagged separately)

- `node_modules/.bin/{tsc,tsc.cmd,tsserver,tsserver.cmd,vitest,vitest.cmd}` show as **deleted** in `git status`. These are leftover from `node_modules` being tracked by git before `.gitignore` was tightened (7 tracked files total under `node_modules`, all binary shims / a vitest cache file). This package resolves its real toolchain from the yarn workspace root (`…\@mongez\node_modules`), where `typescript`, `vitest`, `fake-indexeddb`, and `@mongez/encryption@2.0.1` are actually installed — this local `node_modules/.bin` was never the one in use. Not attributable to the v2 work; pre-existing repo-hygiene debt (node_modules should not be tracked at all).
- `node_modules/.vite/vitest/results.json` shows modified — that's a vitest cache file this audit's own test run touched, not the timed-out worker.

## 2. Coherence assessment

**No half-finished functions, no TODO/FIXME/stub markers, no `@ts-ignore`/`@ts-expect-error` anywhere in `src/`** (checked with a full-tree grep). Every new export in `src/index.ts` resolves to a real, implemented symbol; every import in the new files resolves to a file that exists. This is materially more finished than a typical 30-minute-timeout leaves behind — it reads like a completed unit of work that simply never got committed, not a mid-edit crash site.

Specific coherence checks:

- **`src/index.ts` exports vs implementations** — clean. `IndexedDBDriver`'s three exported constants and `EncryptedIndexedDBDriver` both exist and are fully implemented; `export * from "./errors"` matches the three classes in `errors.ts`.
- **`package.json` dependency bump is real, not aspirational.** `@mongez/encryption` `^2.0.0` — the sibling package is genuinely at `2.0.1` (checked its own git log: `"security: migrate to WebCrypto AES-256-GCM + PBKDF2 (breaking: async encrypt/decrypt, decrypt throws)"`), and `npm view @mongez/encryption version` confirms `2.0.1` is published. The cache v2 async migration is a correct, coordinated response to that breaking change, not a guess.
- **One real cross-package release risk found:** `@mongez/encryption@2.0.1` declares `"engines": { "node": ">=20" }`. This package's `package.json` has no `engines` field, and `.github/workflows/*.yml` still runs the test matrix on **Node 18**. The Node 18 CI job currently passes only because `vitest.config.ts` aliases `@mongez/encryption` to the sibling **source** (`../encryption/src`) and bypasses `node_modules` resolution entirely in this monorepo checkout. A real consumer installing `@mongez/cache@2.0.0` from npm on Node 18 — or cache's own CI when checked out standalone (the documented "no monorepo siblings" fallback path in `vitest.config.ts`) — would pull `@mongez/encryption` from `node_modules` and be Node-18-incompatible at the encryption layer. **This needs a decision before release:** either bump `cache`'s own `engines.node` to `>=20` and drop Node 18 from the matrix, or it's a silent breaking change for Node 18 consumers.
- **`getAll()` asymmetry.** `IndexedDBDriver`/`EncryptedIndexedDBDriver` gained a public `getAll()`, but it was not added to `CacheDriverInterface`, `BaseCacheEngine`, or `CacheManager`. A consumer using the `CacheManager` facade (`cache.getAll()`, the documented one-API-for-every-driver pattern this package sells itself on) cannot reach it without `cache.getDriver()` and an `as IndexedDBDriver` cast — and it doesn't exist at all on the Web Storage / RunTime drivers. Either finish it (interface + `BaseCacheEngine` fallback that reads all keys and maps `get`) or explicitly scope it as IndexedDB-only surface in the docs. As-is it's an inconsistent public API, not a bug.
- **`has()` semantics diverge between driver families, but intentionally and documented.** Plain drivers' `has()` now checks expiry and evicts (bug fix, matches `get()`). `EncryptedLocalStorageDriver.has()` deliberately does **not** decrypt, so it can report `true` for an entry that `get()` would evaluate as expired-and-evict a moment later. The code comment reasons about this explicitly (avoid paying decrypt cost / a read silently mutating storage). Not a defect, but worth a README callout given the package explicitly used to guarantee `has()`/`get()` agreement as a 1.4.0 fix.
- **Docs are entirely stale against this branch.** `README.md`, `llms.txt`, `llms-full.txt`, and everything under `skills/` still describe the **synchronous** 1.x API. `README.md:338` literally documents the *problem the new `IndexedDBDriver` solves* as an open limitation ("`BaseCacheEngine.get` is synchronous... for real IDB-backed reads, either maintain an in-memory mirror... or route through `@mongez/atom`'s persist slot"). None of README/llms.txt/llms-full.txt/skills/* were touched by the timed-out worker. `CHANGELOG.md` has no `2.0.0` entry (top entry is still `1.4.0`).

## 3. Compile check

This package has **no `tsconfig.json`** and never has (checked git history — none exists at any commit; no sibling package in the workspace shares one either). There is also no `build`/`typecheck` script in `package.json`; the package ships `src/index.ts` directly and CI only runs `yarn test` (vitest, which transpiles via esbuild and does not type-check). So "the package's build script" for a compile check doesn't exist — `npx tsc --noEmit` with no config prints the CLI help and exits without checking anything.

To get a real signal I ran `tsc` directly against every non-test source file with explicit strict flags (`--strict --target es2020 --module esnext --moduleResolution bundler --lib es2020,dom --skipLibCheck`), letting Node's normal `node_modules` walk-up resolve `@mongez/encryption` from the workspace root:

```
src/drivers/EncryptedIndexedDBDriver.ts(34,56): error TS2339: Property 'encrypt' does not exist on type
  'string | number | CacheDriverInterface | CacheEncryptionConfigurations | ((value: any) => any) | ((value: any) => any)'.
  Property 'encrypt' does not exist on type 'string'.
src/drivers/EncryptedIndexedDBDriver.ts(76,61): error TS2339: Property 'decrypt' does not exist on type '...'.
src/drivers/EncryptedLocalStorageDriver.ts(32,38): error TS2339: Property 'encrypt' does not exist on type '...'.
src/drivers/EncryptedLocalStorageDriver.ts(64,61): error TS2339: Property 'decrypt' does not exist on type '...'.
```

**All four are pre-existing, not introduced by this branch.** `getCacheConfig(key: keyof CacheConfigurations)` indexes a `Partial<CacheConfigurations>` with a non-literal `keyof` parameter, so TypeScript widens the return to a union of every config value's type instead of narrowing to the one requested — `getCacheConfig("encryption")?.encrypt(...)` has always had this shape. I confirmed the identical call pattern exists verbatim in `EncryptedLocalStorageDriver.ts` at `HEAD` (1.4.0, `git show HEAD:...`). It has simply never been caught because the package has never been type-checked under `--strict` with a real `tsconfig.json`. Not a regression, but it means "does this compile cleanly" has never actually been verified for this package at any released version — worth fixing (`getCacheConfig` needs an overload/generic signature) independent of the v2 work.

No other type errors surfaced across the full non-test source set.

## 4. Test suite

`npx vitest run` (from the package directory, resolving the toolchain via the yarn workspace root):

```
 Test Files  10 passed (10)
      Tests  179 passed (179)
   Duration  118.04s
```

All ten suites pass, including both new IndexedDB suites (36 + 11 = 47 new tests) run against `fake-indexeddb`. Up from the 96 tests recorded in the 1.3.4 changelog entry — the growth is consistent with the new driver plus the async-conversion rewrites of every existing suite, not padding.

## 5. Security pass (new/changed code, IndexedDB driver focus)

- **Key handling.** Cache keys are opaque strings; `getKey()` is plain string concatenation (`prefix + key`), never used to build a code path, file path, or query. No `eval`, `new Function`, or `Function()` constructor anywhere in `src/` (checked). No dynamic `require`/`import()` driven by cache data.
- **Serialization.** Web Storage / RunTime drivers still go through `JSON.parse`/`JSON.stringify` (unchanged from 1.4.0, still safe — no `eval`-based deserialization anywhere, confirmed by grep). `IndexedDBDriver` deliberately skips a JSON pass and stores values via the browser's structured-clone algorithm instead — appropriate: structured clone has no code-execution surface (functions/DOM nodes are rejected by the browser itself, not silently accepted), and this is called out in the class doc as the reason `convertValue`/`parseValue` default to identity for this driver.
- **Prototype pollution on rehydration — the one place stored (attacker-reachable, since anything on the same origin can write into IndexedDB) keys become object properties again is `getAll()`.** Both `IndexedDBDriver.getAll()` and `EncryptedIndexedDBDriver.getAll()` build onto an `Object.create(null)` base (no inherited prototype to shadow) *and* additionally route any key matching `isForbiddenKey()` (`__proto__`, `constructor`, `prototype`) through `Object.defineProperty` instead of bracket assignment — belt-and-braces even if the base object ever gained a prototype. `EncryptedIndexedDBDriver.getAll()` goes further and routes every key through `defineProperty` unconditionally. This is directly tested (`src/__tests__/indexeddb-driver.test.ts`, "prototype-polluting keys" suite): round-trips `__proto__`/`constructor`/`prototype` as inert data and asserts `Object.prototype` is untouched. **No prototype-pollution vector found.**
- **Dynamic property writes elsewhere:** none beyond the `getAll()` case above — `Object.defineProperty` calls are the only dynamic-key writes in the new code, and both call sites pass a hard-coded `{writable, enumerable, configurable}` descriptor with no attacker-controlled descriptor fields.
- **TTL/tamper handling in `EncryptedIndexedDBDriver`.** The record stores `expiresAt` in the clear (for GC without decrypting every row) *and* inside the encrypted envelope (authenticated). I traced the logic: both copies are written from the same value at `set()` time, so under normal operation they agree; the only way they'd diverge is an attacker with write access to the IDB store (already same-origin, so already able to delete/corrupt entries at will) editing the plaintext copy directly. Extending the plaintext copy buys them nothing because `get()` still decrypts and re-checks the authenticated `expiresAt` before returning data — confirmed by a dedicated test (`"an attacker cannot extend a TTL by editing the plaintext expiresAt"`). Shortening it just self-evicts their own tampered row. This holds up; no exploitable gap.
- **Tamper → decrypt failure handling.** `EncryptedIndexedDBDriver.get()` treats any decrypt/auth failure as a cache miss and evicts the row (consistent with the 1.4.0 fix to `EncryptedLocalStorageDriver` for the same reason: a poisoned entry must not turn into a persistent throw / availability problem). Tested for the poisoned-record and rotated-key cases, and that a poisoned record doesn't affect its neighbours (transaction/key isolation).
- **`clear()` scoping.** IndexedDB `clear()` reuses the same prefix-scoping fix that shipped for Web Storage in 1.4.0 (don't wipe entries outside your own namespace) — implemented via a cursor walk inside one transaction so a crash mid-clear can't leave a half-cleared, unprefixed state visible. No origin-wide-wipe regression.
- **Key material / secrets.** The cache package never touches encryption keys directly — `encrypt`/`decrypt` are opaque callbacks supplied via `setCacheConfigurations({ encryption })`, delegated entirely to `@mongez/encryption`. No key material is logged, and no error message in `errors.ts` embeds cache values, only key names and database/store names.
- Nothing found here blocks release on security grounds. The new code is, if anything, more carefully threat-modeled than the 1.4.0 baseline it extends (it inherits the 1.4.0 prefix-scoping and poisoned-entry fixes and applies the same reasoning to the new driver, plus adds the prototype-pollution guard that 1.4.0's own `BaseCacheEngine` never needed because Web Storage doesn't have a bulk-read-into-object-literal path).

## 6. What's left for a releasable 2.0.0, and keep-or-discard

**Recommendation: keep and finish.** This is not a half-built branch to throw away — it's a coherent, well-tested, security-conscious implementation that stalled on wall-clock time, not on unresolved design problems. Discarding it would mean redoing genuinely good work (47 new tests including a deliberate prototype-pollution suite and a TTL-tamper suite most from-scratch attempts wouldn't think to write). Remaining work is documentation and release hygiene, not architecture or implementation.

Ordered remaining work:

1. **Decide the Node-18 question** — bump this package's `engines.node` to `>=20` (matching `@mongez/encryption@2.0.1`'s requirement) and drop Node 18 from `.github/workflows/*.yml`, or explicitly keep Node 18 and pin `@mongez/encryption` to a `1.x`-compatible shim. This is the one item that changes behavior for real consumers, not just docs — resolve before anything else.
2. **Update `README.md`, `llms.txt`, `llms-full.txt`, and `skills/*`** for the async contract and the new `IndexedDBDriver`/`EncryptedIndexedDBDriver`. In particular `README.md:338` currently documents as an open limitation the exact gap this release closes — leaving it as-is would ship a v2 whose own docs contradict it.
3. **Add a `2.0.0` section to `CHANGELOG.md`** (Breaking: every driver method is now async; Added: `IndexedDBDriver`, `EncryptedIndexedDBDriver`, `errors.ts`, `keys()`) — the package's own changelog discipline (see the detailed 1.4.0 and 1.3.4 entries) should carry through.
4. **Resolve the `getAll()` asymmetry** — either promote it to `CacheDriverInterface`/`BaseCacheEngine`/`CacheManager` so it's usable through the facade on every driver, or document it explicitly as IndexedDB-only surface reached via `cache.getDriver()`.
5. **Fix `getCacheConfig`'s return-type widening** (pre-existing, surfaced by strict-mode `tsc`, not new in this branch) — give it an overloaded/generic signature so `getCacheConfig("encryption")` actually narrows to `CacheEncryptionConfigurations | undefined`. Low risk, but worth doing while touching this file, and it's the only thing standing between this package and a clean `--strict` compile.
6. **Optional but recommended:** add a `tsconfig.json` + a `typecheck` script and a CI step running it — this package has never had one, so "does this type-check" has never actually been continuously verified, which is how the `getCacheConfig` issue survived undetected through three releases.
7. **Housekeeping, not release-blocking:** the 7 stray `node_modules/.bin/*` + `.vite` files tracked in git predate this branch and aren't related to it, but since someone's about to touch `package.json`/`.github` anyway, worth `git rm --cached` them and confirming `.gitignore` actually covers the pattern that let them in originally.

None of the above requires touching `IndexedDBDriver.ts`, `EncryptedIndexedDBDriver.ts`, `isForbiddenKey.ts`, `errors.ts`, `BaseCacheEngine.ts`, `CacheManager.ts`, or `types.ts` for correctness — those are done and tested. Effort remaining is docs + one dependency/CI decision + two small, low-risk source touch-ups.
