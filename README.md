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

```js
import { PlainLocalStorageDriver, setCacheConfigurations } from '@mongez/cache';

setCacheConfigurations({
    driver: new PlainLocalStorageDriver(),    
});
```

### Storing value in the cache

```js
import cache from '@mongez/cache';

// this will store in the local storage in the browser key `name` and its corresponding value `Hasan`
cache.set('name', 'Hasan');
```

### Getting Value from storage

```js
import cache from '@mongez/cache';

console.log(cache.get('name')); // Hasan
```

If the key doesn't exist we can return a default value instead.

```js
import cache from '@mongez/cache';

console.log(cache.get('some-not-stored-key', 'Welcome')); // Welcome
```

### Setting Key Prefix

We can also define a prefix key that prefixes all of our keys.

> It's recommended to define a prefix key to your app, so similar keys don't override each other especially if you're working on localhost.

```js
import { PlainLocalStorageDriver, setCacheConfigurations } from '@mongez/cache';

setCacheConfigurations({
    driver: new PlainLocalStorageDriver(),    
    key: 'store-',
});

// this will store in the local storage in the browser key `store-name` and its corresponding value `Hasan`
cache.set('name', 'Hasan');

console.log(cache.get('name')); // Hasan
```

### Removing key from storage

```js
import cache from '@mognez/cache';

cache.remove('name');

console.log(cache.get('name')); // null
```

## Cache Drivers List

The following list implements [Cache Driver Interface](#cache-driver-interface).

- [Plain Local Storage Driver](./plain-local-storage-driver)
- [Encrypted Local Storage Driver](./encrypted-local-storage-driver)

## Plain Local Storage Driver

The plain local storage implements [Local Storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) of the browser.

## Encrypted Local Storage Driver

Works exactly same as [Plain Local Storage Driver](./plain-local-storage-driver) except that values are encrypted when stored in the storage.

To make this work, make sure that you've set encryption key in [Encryption Configuration](https://github.com/hassanzohdy/mongez-encryption#encryption-configurations), the `@mongez/encryption` package is a dependency to this package so you don't have to install it again.

```ts
import { setEncryptionConfigurations } from '@mongez/encryption';
import { EncryptedLocalStorageDriver, setCacheConfigurations } from '@mongez/cache';

// make sure to set the encryption key at some point in your application

setEncryptionConfigurations({
    key: 'app-key',
});

setCacheConfigurations({
    driver: new EncryptedLocalStorageDriver(),    
    key: 'store-',
});

// The value will be stored as encrypted value something like store-name: asdfgtrhy54rewqsdaftrgyujiy67t54re3wqsd 
cache.set('name', 'Hasan'); 

console.log(cache.get('name')); // Hasan
```

## Cache Manager

By default the cache manager is shipped with a new instance from `CacheManager` class, so you don't have to instanciate it again as it, however, you can make a new instance of it by exporting it directly.

```js
import { PlainLocaleStorageDriver, CacheManager, CacheManagerInterface } from '@mongez/cache';

const cache: CacheManagerInterface = new CacheManager;

cache.setDriver(PlainLocaleStorageDriver).setPrefixKey('my-key');

// start using it.
```

## Using Storage Driver Directly

You may also use any driver directly, the cache manager is just a facade to the storage driver

```js
import { PlainLocaleStorageDriver, CacheDriverInterface } from '@mongez/cache';

const cacheDriver: CacheDriverInterface = new PlainLocaleStorageDriver();

cacheDriver.set('name', 'Hasan'); // Hasan is stored in locale storage
//
```

## Cache Driver Interface

```ts
type CacheDriverInterface = {
  /**
   * Set cache into storage
   * @param {string} key
   * @param {any} value
   */
  set(key: string, value: any): void;

  /**
   * Get value from cache engine, if key does not exist return default value
   * @param {string} key
   * @param {any} defaultValue
   */
  get(key: string, defaultValue: any): any;

  /**
   * Determine whether the cache engine has the given key
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key: string): boolean;

  /**
   * Remove the given key from the cache storage
   *
   * @param  {string} key
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
   *
   * @param CacheDriverInterface driver
   */
  setDriver(driver: CacheDriverInterface): void;
  /**
   * Get driver engine
   *
   * @returns {CacheDriverInterface}
   */
  getDriver(): CacheDriverInterface;
}
```

## TODO

- Implements Session Storage.
- Add Node Js Storage drivers such as Redis, File, MemCache.
- Add Unit Tests.
