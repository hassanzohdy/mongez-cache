---
name: mongez-cache-session-storage
description: Documents PlainSessionStorageDriver — tab-scoped caching that survives refreshes but not tab closes, with identical API to the localStorage driver.
when_to_use: User imports PlainSessionStorageDriver from @mongez/cache, asks about tab-scoped storage, sessionStorage-backed caching, or storing draft/scroll state that should vanish when the tab closes.
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
