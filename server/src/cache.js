// แทน CacheService ของ Apps Script (in-memory TTL cache)
const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { store.delete(key); return null; }
  return hit.value;
}

export function cachePut(key, value, ttlSeconds = 300) {
  store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export function cacheClear(prefix = '') {
  for (const key of store.keys()) {
    if (!prefix || key.startsWith(prefix)) store.delete(key);
  }
}
