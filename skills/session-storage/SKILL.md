---
name: mongez-cache-session-storage
description: |
  Reference for `PlainSessionStorageDriver` — tab-scoped `window.sessionStorage` backend with the same async envelope, TTL, prefix-scoped `clear()`, and corruption-recovery semantics as the localStorage driver; data survives refresh but not tab close.
---

# PlainSessionStorageDriver

The session-storage variant of the plain driver. Same contract, same envelope, same TTL, same async API — but backed by `window.sessionStorage` instead of `localStorage`. Values disappear when the tab closes.

## Signature

```ts
import { PlainSessionStorageDriver } from "@mongez/cache";

class PlainSessionStorageDriver extends BaseCacheEngine implements CacheDriverInterface {
  public storage: Storage;          // = sessionStorage
}
```

## Usage

```ts
import cache, { PlainSessionStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainSessionStorageDriver(),
});

await cache.set("scroll.y", 312);
await cache.set("draft", { title: "", body: "Half-written..." });

await cache.get("scroll.y");              // 312
```

Everything in [`local-storage.md`](../local-storage/) applies — the envelope format, TTL behavior, corruption recovery, prefix handling, and SSR caveats are identical. Only the backing storage differs.

## Gotchas

- **Tabs are isolated.** Two tabs of the same site each have their own `sessionStorage`. Two tabs of the same `localStorage` share data; two tabs of the same `sessionStorage` don't.
- **`clear()` is scoped to the configured prefix** (since v1.4.0). Same as the local-storage driver — with no prefix configured, it wipes the entire session storage backend for the origin.
- **`sessionStorage` also has a ~5MB cap.** Same quota behavior as localStorage.
- **Every method returns a `Promise`.** `await cache.set/get/has/remove/clear/keys/getAll` — the work is synchronous under the hood but the contract is async as of 2.0.0.
