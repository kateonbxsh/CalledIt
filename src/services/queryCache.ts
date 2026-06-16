type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  promise?: Promise<T>;
};

const queryCache = new Map<string, CacheEntry<unknown>>();

export async function readThroughCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = queryCache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = loader()
    .then((value) => {
      queryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      const latest = queryCache.get(key) as CacheEntry<T> | undefined;
      if (latest?.promise === promise) queryCache.delete(key);
      throw error;
    });

  queryCache.set(key, {
    value: cached?.value,
    expiresAt: cached?.expiresAt ?? 0,
    promise,
  });

  return promise;
}

export function invalidateQueryCache(prefix?: string) {
  if (!prefix) {
    queryCache.clear();
    return;
  }

  for (const key of [...queryCache.keys()]) {
    if (key.startsWith(prefix)) queryCache.delete(key);
  }
}
