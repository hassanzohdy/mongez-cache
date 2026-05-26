---
name: mongez-cache-session-storage
description: |
  Reference for `PlainSessionStorageDriver` — tab-scoped `window.sessionStorage` backend with the same envelope, TTL, prefix, and corruption-recovery semantics as the localStorage driver; data survives refresh but not tab close.
  TRIGGER when: code calls `new PlainSessionStorageDriver()` or imports `PlainSessionStorageDriver` from `@mongez/cache`; user asks "how do I cache scroll position / draft form data per tab", "how do I make a wizard remember progress through refreshes only", or "how do I use sessionStorage with `@mongez/cache`"; `import { PlainSessionStorageDriver } from "@mongez/cache"`.
  SKIP: cross-session persistence — use `mongez-cache-local-storage`; in-memory only cache — use `mongez-cache-runtime`; encrypted variant of session storage — use `mongez-cache-encryption` or `mongez-cache-encrypted-cache`; choosing among all drivers — use `mongez-cache-drivers`.
---

# PlainSessionStorageDriver

The session-storage variant of the plain driver. Same contract, same envelope, same TTL — but backed by `window.sessionStorage` instead of `localStorage`. Values disappear when the tab closes.

## Signature

```ts
import { PlainSessionStorageDriver } from "@mongez/cache";

class PlainSessionStorageDriver extends BaseCacheEngine implements CacheDriverInterface {
  public storage: Storage;          // = sessionStorage
}
```

## When to use it

- **Tab-scoped state**: scroll position, draft form data, multi-step wizard progress.
- **Auth tokens you want gone on tab close** — though encrypted localStorage with a short TTL is usually the better trade-off.
- **Shopping cart for an unauthenticated user** — `sessionStorage` lets the cart survive a refresh but not a tab close.

For state that should outlive the tab, use [`PlainLocalStorageDriver`](./local-storage.md) instead. For state that should only live for the current page-view, use [`RunTimeDriver`](./runtime.md).

## Usage

```ts
import { PlainSessionStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainSessionStorageDriver(),
});

cache.set("scroll.y", 312);
cache.set("draft", { title: "", body: "Half-written..." });

cache.get("scroll.y");              // 312
```

Everything in [`local-storage.md`](./local-storage.md) applies — the envelope format, TTL behavior, corruption recovery, prefix handling, and SSR caveats are identical. Only the backing storage differs.

## Gotchas

- **Tabs are isolated.** Two tabs of the same site each have their own `sessionStorage`. Two tabs of the same `localStorage` share data; two tabs of the same `sessionStorage` don't.
- **`clear()` is not prefix-scoped.** Same as the local-storage driver — wipes the entire session storage backend for the origin.
- **`sessionStorage` also has a ~5MB cap.** Same quota behavior as localStorage.
