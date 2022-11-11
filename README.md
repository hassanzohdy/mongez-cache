# Mongez Cache

This cache package handles various ways to store data in the browser.

The current cache system implements [Local Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) Cache.

By default there is a [Cache Manager](#cache-manager) that manages the caching behind the scenes.

## Installation

`yarn add @mongez/cache`

Or

`npm i @mongez/cache`

## Usage

First off, let's define our cache configurations so we can use cache later without setting it every time.

### Setting Cache Configurations

```ts
import { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
});
```

### Storing value in the cache

```ts
import cache from "@mongez/cache";

// this will store in the local storage in the browser key `name` and its corresponding value `Hasan`
cache.set("name", "Hasan");
```

We can also store arrays or objects.

```ts
import cache from "@mongez/cache";

// store array
cache.set("letters", ["a", "b", "c", "d", "e", "f"]);

// store object
cache.set("user", {
  id: 1,
  name: "Hasan",
});
```

### Getting Value from storage

```ts
import cache from "@mongez/cache";

console.log(cache.get("name")); // Hasan
```

If the key doesn't exist we can return a default value instead.

```ts
import cache from "@mongez/cache";

console.log(cache.get("some-not-stored-key", "Welcome")); // Welcome
```

> If no default value passed and the key does not exist, then `null` will be returned.

Getting stored arrays or objects:

```ts
import cache from "@mongez/cache";

console.log(cache.get("letters")); // [ 'a', 'b', 'c', 'd', 'e', 'f']
console.log(cache.get("user")); // { id: 1, name: 'Hasan'}
```

### Setting Key Prefix

We can also define a prefix key that prefixes all of our keys.

> It's recommended to define a prefix key to your app, so similar keys don't override each other especially if you're working on localhost.

```ts
import { PlainLocalStorageDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
  key: "store-",
});

// this will store in the local storage in the browser key `store-name` and its corresponding value `Hasan`
cache.set("name", "Hasan");

console.log(cache.get("name")); // Hasan
```

## Cache Configurations list

Here is the list of all available configurations:

```ts
 type CacheDriverInterface = {
  /**
   * Set cache into storage
   */
  set(key: string, value: any, expiresAfter?: number): CacheDriverInterface;

  /**
   * Get value from cache engine, if key does not exist return default value
   */
  get(key: string, defaultValue?: any): any;

  /**
   * Set value parser
   */
  setValueParser(parser: any): CacheDriverInterface;

  /**
   * Set value converter
   */
  setValueConverter(converter: any): CacheDriverInterface;

  /**
   * Determine whether the cache engine has the given key
   */
  has(key: string): boolean;

  /**
   * Remove the given key from the cache storage
   */
  remove(key: string): CacheDriverInterface;

  /**
   * Set prefix key
   */
  setPrefixKey(key: string): CacheDriverInterface;

  /**
   * Get prefix key
   */
  getPrefixKey(): string;
};

 type CacheConfigurations = {
  /**
   * The Cache drier interface
   */
  driver: CacheDriverInterface;
  /**
   * Set value parser when getting value from cache
   */
  valueParer?: (value: any) => any;
  /**
   * Set value converter when setting value to cache
   */
  valueConverter?: (value: any) => any;
  /**
   * A prefix for each key in the driver, this is useful for multi apps in same domain
   */
  prefix?: string;
  /**
   * Expire time of the cache in seconds
   *
   * @default Infinity
   */
  expiresAfter?: number;
  /**
   * Encryption handlers
   */
  encryption?: {
    /**
     * Encrypt function
     */
    encrypt: (value: any) => any;
    /**
     * Decrypt function
     */
    decrypt: (value: any) => any;
  };
};
```

### Removing key from storage

```ts
import cache from "@mongez/cache";

cache.remove("name");

console.log(cache.get("name")); // null
```

## Cache Drivers List

The following list implements [Cache Driver Interface](#cache-driver-interface).

- [Plain Local Storage Driver](#plain-local-storage-driver)
- [Encrypted Local Storage Driver](#encrypted-local-storage-driver)
- [Plain Session Storage Driver](#plain-session-storage-driver)
- [Encrypted Session Storage Driver](#encrypted-session-storage-driver)
- [RunTime Driver](#runtime-driver)

## Plain Local Storage Driver

The plain local storage implements [Local Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) of the browser.

The driver name is: `PlainLocalStorageDriver`

```ts
import {
  PlainLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainLocalStorageDriver(),
});

cache.set("name", "Hasan");

console.log(cache.get("name")); // Hasan
```

## Encrypted Local Storage Driver

> Starting From V1.2.0 it requires to set the `encryption.encrypt` and `encryption.decrypt` functions in configuration to make this work.

Works exactly same as [Plain Local Storage Driver](#plain-local-storage-driver) except that values are encrypted when stored in the storage.

To make this work, make sure that you've set encryption key in [Encryption Configuration](https://github.com/hassanzohdy/mongez-encryption#encryption-configurations), the `@mongez/encryption` package is a dependency to this package so you don't have to install it again.

```ts
import { encrypt, decrypt setEncryptionConfigurations } from "@mongez/encryption";
import {
  EncryptedLocalStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

// make sure to set the encryption key at some point in your application

setEncryptionConfigurations({
  key: "app-key",
});

setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  // add encryption handlers
  encryption: {
    encrypt,
    decrypt,
  }
});

// The value will be stored as encrypted value something like store-name: asdfgtrhy54rewqsdaftrgyujiy67t54re3wqsd
cache.set("name", "Hasan");

console.log(cache.get("name")); // Hasan
```

## Plain Session Storage Driver

> Added in v1.1

The plain session storage implements [Session Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) of the browser.

The driver name is: `PlainSessionStorageDriver`

```ts
import {
  PlainSessionStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

setCacheConfigurations({
  driver: new PlainSessionStorageDriver(),
});

cache.set("name", "Hasan");

console.log(cache.get("name")); // Hasan
```

## Encrypted Session Storage Driver

> Added in v1.1

> Starting From V1.2.0 it requires to set the `encryption.encrypt` and `encryption.decrypt` functions in configuration to make this work.

Works exactly same as [Plain session Storage Driver](#plain-session-storage-driver) except that values are encrypted when stored in the storage.

To make this work, make sure that you've set encryption key in [Encryption Configuration](https://github.com/hassanzohdy/mongez-encryption#encryption-configurations), the `@mongez/encryption` package is a dependency to this package so you don't have to install it again.

```ts
import { encrypt, decrypt setEncryptionConfigurations } from "@mongez/encryption";
import {
  EncryptedSessionStorageDriver,
  setCacheConfigurations,
} from "@mongez/cache";

// make sure to set the encryption key at some point in your application

setEncryptionConfigurations({
  key: "app-key",
});

setCacheConfigurations({
  driver: new EncryptedLocalStorageDriver(),
  // add encryption handlers
  encryption: {
    encrypt,
    decrypt,
  }
});

// The value will be stored as encrypted value something like store-name: asdfgtrhy54rewqsdaftrgyujiy67t54re3wqsd
cache.set("name", "Hasan");

console.log(cache.get("name")); // Hasan
```

## Runtime Driver

> Added in v1.1

If you just want to cache the data in the runtime (memory), use `RunTimeDriver` instead.

```ts
import cache, { RunTimeDriver, setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  driver: new RunTimeDriver(),
});

cache.set("name", "Hasan");

console.log(cache.get("name")); // Hasan
```

## Expire Time

> Added in v1.1

You can set an expire time for each key, the key will be removed from the storage after the expire time.

```ts
import cache from "@mongez/cache";

cache.set("name", "Hasan", 60 * 5); // expires in 5 minutes

// after one minute
cache.get('name'); // Hasan

// after 5 minutes
cache.get('name'); // null
```

This will store the key `name` with value `Hasan` and it will be removed after 5 minutes.

 By default the cache value will be cached for ever, You can override the default expire time from the configuration.

```ts
import { setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  expireTime: 60 * 5, // 5 minutes
});
```

The default value of expire time is `Infinity` which means the value will be cached for ever.

## Cache Manager

By default the cache manager is shipped with a new instance from `CacheManager` class, so you don't have to create it again, however, you can make a new instance of it by importing it directly.

```ts
import {
  PlainLocaleStorageDriver,
  CacheManager,
  CacheManagerInterface,
} from "@mongez/cache";

const cache: CacheManagerInterface = new CacheManager();

cache.setDriver(PlainLocaleStorageDriver).setPrefixKey("my-key");

// start using it.
```

## Using Storage Driver Directly

You may also use any driver directly, the cache manager is just a facade to the storage driver

```ts
import { PlainLocaleStorageDriver, CacheDriverInterface } from "@mongez/cache";

const cacheDriver: CacheDriverInterface = new PlainLocaleStorageDriver();

cacheDriver.set("name", "Hasan"); // Hasan is stored in locale storage
//
```

## Cache Driver Interface

```ts
type CacheDriverInterface = {
  /**
   * Set cache into storage
   */
  set(key: string, value: any, expiresAfter?: number): void;

  /**
   * Get value from cache engine, if key does not exist return default value
   */
  get(key: string, defaultValue: any): any;

  /**
   * Determine whether the cache engine has the given key
   */
  has(key: string): boolean;

  /**
   * Remove the given key from the cache storage
   */
  remove(key: string): void;

  /**
   * Set prefix key
   */
  setPrefixKey(key: string): void;

  /**
   * Get prefix key
   */
  getPrefixKey(): string;
};
```

## Cache Manager Interface

```ts
 interface CacheManagerInterface extends CacheDriverInterface {
  /**
   * Set driver engine
   */
  setDriver(driver: CacheDriverInterface): void;
  /**
   * Get driver engine
   */
  getDriver(): CacheDriverInterface;
}
```

## Getting Cache Configurations

> Added in v1.1

You can get the current cache configurations by importing `getCacheConfigurations` function.

```ts
import { getCacheConfigurations } from "@mongez/cache";

const configurations = getCacheConfigurations();
```

Or if you want to get just one value use `getCacheConfig(key: string)` instead.

```ts
import { getCacheConfig } from "@mongez/cache";

const expiresAfter = getCacheConfig("expiresAfter");
```

## Define Value Converter

> Added in 1.1.6

By default the value is being converted to JSON string before storing it in the storage, and when getting the value it will be converted back to the original value.

To define the value converter, you can define the `valueConverter` function in the configurations.

```ts
import { setCacheConfigurations } from "@mongez/cache";

setCacheConfigurations({
  // the value will be stored as it is
  valueConverter: JSON.stringify,
  // the value will be converted back to the original value
  valueParer: JSON.parse,
});
```

You can also set it directly in the driver.

```ts
import { PlainSessionStorageDriver } from "@mongez/cache";

const driver = new PlainSessionStorageDriver();

driver.setValueConverter(JSON.stringify).setValueParser(JSON.parse);
```

## Change Log

- Version 1.2.0 (11 Nov 2022)
  - Removed Encryption Dependency and set it in the configuration.
- Version 1.1.6 (07 Nov 2022)
  - Added `valueConverter` and `valueParser` to the configurations.  
- Version 1.1.0 (04 Nov 2022)
  - Added [Runtime Cache Driver](#runtime-driver).
  - Added [Plain Session Cache Driver](#plain-session-storage-driver).
  - Added [Encrypted Session Cache Driver](#encrypted-session-storage-driver).
  - Added [Expire Time](#expire-time).
  - Added [Getting Cache Configurations](#getting-cache-configurations).  

## TODO

- Add Unit Tests.
- Add `encryptKey` feature to encrypt the key itself.
