/**
 * Keys that reach `Object.prototype` (or any other prototype) when they
 * are assigned onto a plain object, polluting every object in the
 * runtime.
 *
 * Cache keys are caller-controlled — and on a shared origin they are
 * also *storage*-controlled, since anything else running on the origin
 * can write a key of its choosing into localStorage or the cache
 * database. Any helper that turns stored keys back into object
 * properties has to filter these out first.
 */
export const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];

/**
 * Check whether `key` is a prototype-pollution vector.
 *
 * Note that storing such a key is perfectly safe in every driver: the
 * runtime driver is backed by a `Map`, Web Storage keys are strings in a
 * separate namespace, and IndexedDB keys are structured-clone values —
 * none of them do prototype-chain lookups. The guard exists for the one
 * place where keys become object properties again: bulk reads that
 * return a plain `{ key: value }` record.
 */
export default function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.includes(key);
}
