import Redis, { RedisOptions } from "ioredis";

// ─────────────────────────────────────────────────────────────────────────────
// Redis Client Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const redisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0"),

  retryStrategy: (times: number) => {
    if (times > 10) {
      console.error("❌ Redis: max reconnection attempts reached. Giving up.");
      return null;
    }
    return Math.min(times * 200, 3000);
  },

  connectTimeout: 10_000,
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  keepAlive: 10_000,
  commandTimeout: 10_000, 
};

// ─── Separate options for BullMQ ───
// BullMQ requirements:
//   maxRetriesPerRequest: null (required)
//   enableReadyCheck: false (required)
//   do not use lazyConnect — BullMQ manages connections itself
export const bullMQRedisOptions: RedisOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || "0"),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};



// ─────────────────────────────────────────────────────────────────────────────
// Client Instance
// ─────────────────────────────────────────────────────────────────────────────

export const redis = new Redis(redisOptions);

export const createRedisClient = () => new Redis(redisOptions);

// Connection lifecycle events
redis.on("connect", () => console.info("✅ Redis: connected"));
redis.on("ready", () => console.info("✅ Redis: ready to accept commands"));
redis.on("error", (err) => console.error(`❌ Redis error: ${err.message}`));
redis.on("close", () =>
  console.warn("⚠️  Redis: connection closed (will retry)"),
);
redis.on("reconnecting", () => console.warn("♻️  Redis: reconnecting..."));

// 'end' means permanently closed — fired when retryStrategy returns null
// 'close' is a temporary close
redis.on("end", () =>
  console.error("❌ Redis: connection ended permanently — no more retries"),
);

// ─────────────────────────────────────────────────────────────────────────────
// TTL Constants (all values in seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const TTL = {
  SHORT: 60 * 10, //  10 minutes — paginated / filtered list
  MEDIUM: 60 * 30, // 30 minutes — single record by ID
  LONG: 60 * 60 * 6, //  6 hours — rarely-changing data
  DAY: 60 * 60 * 24, // 24 hours — static / config data
  SESSION: 60 * 60 ,
  TOKEN: 60 * 60 * 24, // 24 hours — JWT blacklist
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Cache Key Builders
//
// Convention:
//   <model>:id:<id>              → single record
//   <model>:list:<hash>          → paginated / filtered list
//   <model>:my:<userId>:<hash>   → user-scoped list
//   <model>:*                    → full model wipe (SCAN pattern)
//   <model>:list:*               → list-only wipe (SCAN pattern)
//   <model>:my:<userId>:*        → one user's lists wipe (SCAN pattern)
// ─────────────────────────────────────────────────────────────────────────────

export const CacheKeys = {
  // Key for a single record
  single: (model: string, id: string) => `${model}:id:${id}`,

  // Key for a paginated/filtered list
  // Converts the params object to a stable hash to create a unique key
  list: (model: string, params: Record<string, unknown>) =>
    `${model}:list:${stableHash(params)}`,

  // Key for a user-specific list
  myList: (model: string, userId: string, params: Record<string, unknown>) =>
    `${model}:my:${userId}:${stableHash(params)}`,

  // SCAN patterns — for bulk delete, not direct keys
  pattern: (model: string) => `${model}:*`,
  listPattern: (model: string) => `${model}:list:*`,
  myListPattern: (model: string, userId: string) => `${model}:my:${userId}:*`,

  // JWT blacklist
  blacklist: (token: string) => `blacklist:${token}`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Cache Stampede Protection
//
// Problem: If many users simultaneously miss the same cache key,
// you can end up issuing many identical DB queries ("thundering herd").
//
// Solution: store the first fetch's Promise in a Map so concurrent
// requests attach to the same Promise and only one DB query is issued.
// ─────────────────────────────────────────────────────────────────────────────

const pendingFetches = new Map<string, Promise<unknown>>();

// ─────────────────────────────────────────────────────────────────────────────
// cacheOr — Read-Through Cache (Optimized & Protected)
//
// Updated Flow:
//   1. Is the key in Redis? → YES: check if it's a negative cache placeholder.
//                            → If placeholder, return null instantly (Penetration Protected).
//                            → Else, parse and return data.
//   2.                      → NO: is someone else fetching this key?
//   3.                      → YES: attach to their Promise (Stampede Protected).
//   4.                      → NO: start a new DB query.
//   5. When DB data arrives:
//      - If data is valid: add a random Jitter to TTL and save to Redis (Avalanche Protected).
//      - If data is null/undefined: save a placeholder with a short TTL (Penetration Protected).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Main Read-Through Cache Handler (cacheOr)
// ─────────────────────────────────────────────────────────────────────────────

export async function cacheOr<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  
  // Try retrieving data from cache and safely bypass on failure
  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      const parsed = JSON.parse(cached);

      // Cache Penetration Shield: Fast-return null if negative marker exists
      if (parsed && parsed.__isNegativeCache === true) {
        return null;
      }

      return parsed as T;
    }
  } catch (err: any) {
    console.error(`Redis GET failed for "${key}": ${err.message}`);
  }

  // Cache Stampede Protection: Consolidate concurrent requests into an existing active promise
  const existing = pendingFetches.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  // Execute database query and map tracking to prevent resource exhaustion
  const fetchPromise = (async () => fetcher())() as Promise<T>;
  pendingFetches.set(key, fetchPromise);

  fetchPromise.finally(() => {
    pendingFetches.delete(key);
  });

  // Background Cache Resolution: Sync fresh data with system security optimizations
  fetchPromise
    .then((fresh) => {
      // Cache Penetration Protection: Lock missing keys for 2 minutes using negative caching
      if (fresh === undefined || fresh === null) {
        const negativeTTL = 60 * 2;
        redis
          .set(key, JSON.stringify({ __isNegativeCache: true }), "EX", negativeTTL)
          .catch((err) =>
            console.error(`Redis Negative SET failed for "${key}": ${err.message}`),
          );
        return;
      }

      // Cache Avalanche Protection: Append a random jitter (0-30s) to scatter bulk expiration spikes
      const jitter = Math.floor(Math.random() * 30);
      const finalTTL = ttl + jitter;

      redis
        .set(key, JSON.stringify(fresh), "EX", finalTTL)
        .catch((err) =>
          console.error(`Redis SET failed for "${key}": ${err.message}`),
        );
    })
    .catch(() => {
      // Avoid modifying cache state on underlying database failure
    });

  return fetchPromise;
}
// ─────────────────────────────────────────────────────────────────────────────
// Invalidation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete specific keys.
 * Accepts one or more exact keys.
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  await redis
    .del(...keys)
    .catch((err) => console.error(`Redis DEL failed: ${err.message}`));
}

/**
 * Delete all keys matching a glob pattern.
 * Uses SCAN (never use KEYS in production because it blocks).
 *
 * Batch size is 500 to avoid blocking the Redis event loop with huge DEL commands.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  const BATCH_SIZE = 500;
  let cursor = "0";

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        // COUNT 200: ~200 keys per iteration
        // Increasing this reduces iterations but makes each scan larger
        // 200 is a balanced value across dev and production
        "COUNT",
        200,
      );
      cursor = nextCursor;

      if (keys.length) {
        // Delete in batches to avoid blocking the Redis event loop
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
          const batch = keys.slice(i, i + BATCH_SIZE);
          await redis.del(...batch);
        }
      }
    } while (cursor !== "0");
  } catch (err: any) {
    console.error(`Redis SCAN/DEL failed for "${pattern}": ${err.message}`);
  }
}

/**
 * Invalidate all cache for a model (both lists and single records).
 * Use after creates because the new record may appear on any page.
 */
export async function invalidateModel(model: string): Promise<void> {
  await invalidatePattern(CacheKeys.pattern(model));
}

/**
 * Invalidate only list caches; keep single record caches.
 * Use when a related model changed but primary records are still valid.
 */
export async function invalidateModelLists(model: string): Promise<void> {
  await invalidatePattern(CacheKeys.listPattern(model));
}

/**
 * Invalidate a specific record's cache and all list caches for the model.
 * Standard pattern for updates/deletes.
 */
export async function invalidateRecord(
  model: string,
  id: string,
): Promise<void> {
  await Promise.all([
    invalidateKeys(CacheKeys.single(model, id)),
    invalidatePattern(CacheKeys.listPattern(model)),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CacheInvalidator
//
// Import and use these helpers from services. Method names are intentional
// and describe the exact invalidation behavior.
// ─────────────────────────────────────────────────────────────────────────────

export const CacheInvalidator = {
  /**
   * Update / toggle — invalidate record and all lists
   * Use when userId is unknown
   */
  onRecordUpdate: (model: string, id: string) => invalidateRecord(model, id),

  /**
   * Update / toggle — invalidate record, all lists, and owner's personal lists
   * Use this when userId is known (more precise)
   */
  onOwnedRecordUpdate: (model: string, id: string, userId: string) =>
    Promise.all([
      invalidateRecord(model, id),
      invalidatePattern(CacheKeys.myListPattern(model, userId)),
    ]),

  /**
   * Create — invalidate all lists and personal lists
   * The new record may appear on any page so we clear everything.
   * Note: invalidateModel('test') covers test:my:* as well.
   */
  /**
   * Create — invalidate only list caches (not single-record caches).
   * Avoids full model wipe which causes thundering herd.
   * Lists have short TTL (5 min) so they'll auto-recover quickly.
   *
   * If strong consistency is required immediately (rare), use:
   *   CacheInvalidator.many('modelName')
   * instead.
   */
  onRecordCreate: (model: string) => invalidateModelLists(model),

  /**
   * Delete (soft or hard) — invalidate record, lists, and owner's personal lists
   */
  onRecordDelete: (model: string, id: string, userId?: string) =>
    Promise.all([
      invalidateRecord(model, id),
      ...(userId
        ? [invalidatePattern(CacheKeys.myListPattern(model, userId))]
        : []),
    ]),

  /**
   * A related model changed and affects list views for this model.
   * Invalidate only list caches — single record caches remain valid.
   * Example: user name changed and appears in Test list -> CacheInvalidator.onRelatedChange('test')
   */
  onRelatedChange: (dependentModel: string) =>
    invalidateModelLists(dependentModel),

  /**
   * A related model changed and also affects detail pages.
   * Invalidate both list and single record caches.
   * Example: user avatar changed and appears in Test detail -> CacheInvalidator.onRelatedChangeFull('test')
   */
  onRelatedChangeFull: (dependentModel: string) =>
    invalidateModel(dependentModel),

  /**
   * Invalidate all cache for multiple models.
   * Example: CacheInvalidator.many('test', 'order', 'user')
   */
  many: (...models: string[]) =>
    Promise.all(models.map((m) => invalidateModel(m))),

  /**
   * Invalidate only list caches for multiple models.
   */
  manyLists: (...models: string[]) =>
    Promise.all(models.map((m) => invalidateModelLists(m))),
};

// ─────────────────────────────────────────────────────────────────────────────
// Token Blacklist (JWT logout / invalidation)
// ─────────────────────────────────────────────────────────────────────────────

export const blacklistToken = async (
  token: string,
  ttlSeconds: number,
): Promise<void> => {
  await redis.set(CacheKeys.blacklist(token), "1", "EX", ttlSeconds);
};

export const isTokenBlacklisted = async (token: string): Promise<boolean> => {
  const result = await redis.get(CacheKeys.blacklist(token));
  return result !== null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// Call from /health/ready endpoint to verify Redis is reachable
// ─────────────────────────────────────────────────────────────────────────────

export async function isRedisHealthy(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful Disconnect
// Call from server.ts SIGTERM / SIGINT handler
//
// redis.quit()       → closes gracefully after in-flight commands finish
// redis.disconnect() → force-close (used as a fallback if quit times out)
// ─────────────────────────────────────────────────────────────────────────────

export async function disconnectRedis(): Promise<void> {
  try {
    console.info("♻️  Redis: shutting down gracefully...");

    // If quit doesn't complete in 5 seconds, force disconnect
    // Without a timeout, many pending commands could block app shutdown
    await Promise.race([
      redis.quit(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Redis quit timed out after 5s")),
          5_000,
        ),
      ),
    ]);

    console.info("✅ Redis: disconnected gracefully");
  } catch (err: any) {
    console.error(
      `Redis graceful quit failed: ${err.message} — forcing disconnect`,
    );
    redis.disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Stable Hash
//
// params object → deterministic short string

// Why sort keys:
//   { page:1, limit:20 } and { limit:20, page:1 } → same hash
//   Different key order should yield the same cache key

// Why drop empty/null values:
//   { page:1, searchTerm:'' } = { page:1 } — same query
//   Keeping empty values would create unnecessary cache slots

// Why not sort arrays:
//   primitive arrays like ['active','pending'] can be sorted safely
//   object arrays (e.g. [{id:2},{id:1}]) sorting is unpredictable
//   JSON.stringify() provides a consistent output — extra sorting isn't needed
// ─────────────────────────────────────────────────────────────────────────────

function stableHash(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      const v = obj[k];
      if (v !== undefined && v !== null && v !== "") {
        acc[k] = v;
      }
      return acc;
    }, {});

  // djb2 variant hash algorithm
  // simple, fast, collision-resistant enough for cache keys
  const str = JSON.stringify(sorted);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash |= 0; // force to 32-bit integer
  }

  // unsigned 32-bit → base-36 string (0-9 + a-z, small and readable)
  return (hash >>> 0).toString(36);
}

export default redis;
