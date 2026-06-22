# LittleSteps Server — Performance Optimization Plan

> **Date:** 2026-06-22  
> **Auditor:** Principal Software Architect & Performance Engineer  
> **Strategy:** High-impact / low-risk first → High-impact / medium-risk → Everything else

---

## Phase 1: Database Indexing (P0 — HIGHEST PRIORITY)

**Expected Gains:** 10-50× reduction in query times for filtered queries. Response times drop from 200-2000ms to <20ms for most queries.

### 1.1 Add Missing Single-Field Indexes

**Files to modify:** All `*.prisma` schema files

| Model | Index | Why |
|-------|-------|-----|
| `Children` | `@@index([creatorId, isDeleted])` | Every children list query filters on both |
| `Children` | `@@index([isDeleted])` | Soft-delete checks |
| `Notification` | `@@index([receiverId, isRead, createdAt])` | Notification listing by recipient |
| `Chat` | `@@index([roomId, createdAt])` | Chat messages by room |
| `Chat` | `@@index([senderId])` | Sent messages lookup |
| `Chat` | `@@index([receiverId])` | Received messages lookup |
| `Room` | `@@index([senderId, receiverId])` | Finding or creating rooms |
| `Task` | `@@index([userId, category, status])` | Task listing/filtering |
| `Task` | `@@index([userId])` | User's tasks |
| `favorite` | `@@index([userId, taskId])` | Check if favorited (used in `findFirst`) |
| `Payment` | `@@index([userId, status, createdAt])` | Payment history |
| `UserSubscription` | `@@index([userId, subscriptionId])` | Already has unique, add explicit index |
| `ScheduleItem` | `@@index([providerId])` | Provider-linked events |
| `BehaviorLog` | Already has `@@index([childId, logDate])` | ✅ Already done |
| `userSession` | Already has `@@index([userId])`, `@@index([deviceId])` | ✅ Already done |
| `OAuthAccount` | Already has `@@index([userId])` | ✅ Already done |

**Risk:** Low. Adding indexes only improves read performance. Minimal write penalty.
**Effort:** < 30 mins of schema edits.
**Expected Gain:** 80-95% reduction in query time for all filtered queries.

### 1.2 Add Missing Compound Indexes for Hot Paths

**Files to modify:** `prisma/scheduleItem.prisma`, `prisma/children.prisma`

| Model | Compound Index | Query Pattern |
|-------|---------------|---------------|
| `ScheduleItem` | `@@index([userId, isDeleted, startDate, endDate])` | Monthly calendar query |
| `ScheduleItem` | `@@index([userId, isDeleted, status])` | "My items" status filter |
| `Children` | `@@index([creatorId, isDeleted, fullName])` | Search by name for a user |

**Risk:** Low-Medium. Larger compound indexes consume more memory.
**Effort:** 15 mins.

---

## Phase 2: Caching Gaps (P1 — HIGH IMPACT, LOW RISK)

### 2.1 Cache `getEffectiveAccessId()` via Auth Middleware

**Files to modify:** `src/helpers/careGiverAccessor.ts`, `src/app/middlewares/auth.ts`

**Change:** Store `accessId` (resolved caregiver's parent ID) in the auth middleware's user cache. Instead of making a separate DB query, resolve the access ID from the already-cached user object.

**Implementation:**
```typescript
// In careGiverAccessor.ts — accept user object instead of userId
export async function getEffectiveAccessId(user: { role: string; createdById?: string | null }): Promise<string> {
  if (user.role !== userRole.CAREGIVER) return user.id;
  if (!user.createdById) throw new ApiError(httpStatus.FORBIDDEN, '...');
  return user.createdById;
}

// In auth middleware — include createdById in cached user query
select: { id: true, email: true, role: true, status: true, isDeleted: true, createdById: true }
// Store accessId on request: req.accessId
```

**Risk:** Very Low. Simple refactor.
**Effort:** 1 hour.
**Expected Gain:** Eliminates 2-4 DB queries per authenticated request to caregiver-scoped endpoints. ~30-100ms saved per request.

### 2.2 Add Caching to User Module

**Files to modify:** `src/app/modules/user/user.service.ts`

**Change:** Wrap `getAllUsersFromDB`, `getUserDetailsFromDB`, `getMyProfileFromDB` with `cacheOr`. Use short TTL for lists (5 min), medium for profiles (30 min).

**Risk:** Low. Cache invalidation must handle role changes, status toggles, profile updates.
**Effort:** 2 hours.
**Expected Gain:** Admin user list drops from 500-2000ms to <10ms (cached). Profile loads drop from 10-50ms to <1ms.

### 2.3 Extend Session Cache TTL

**Files to modify:** `src/app/middlewares/auth.ts`

**Change:** Increase session cache TTL from 300s to 1800s (30 min). Sessions are validated per-user; higher TTL is safe.

**Risk:** Very Low. Sessions are still validated on expiry.
**Effort:** 5 mins.

### 2.4 Add Selective Cache Invalidation for Create Operations

**Files to modify:** `src/lib/redisConnection.ts` and/or service layer

**Change:** For high-frequency create operations (e.g., behavior logs), only invalidate list caches related to the user's scope, not the entire model cache. Add `invalidateUserScopedLists()` to complement the existing full-model invalidation.

**Risk:** Low. More precise invalidation increases cache hit ratio.
**Effort:** 1 hour.

---

## Phase 3: Application Optimization (P2 — HIGH IMPACT, LOW-MEDIUM RISK)

### 3.1 Optimize Monthly Calendar Algorithm

**Files to modify:** `src/app/modules/scheduleItem/scheduleItem.service.ts` (function `getMonthlyScheduleItems`)

**Current:** O(n × d) — nested loop over items × days.
**Fix:** Single-pass date-to-items Map construction in O(n + d).

```typescript
// Instead of nested loops:
// STEP 1: Build date → items mapping in ONE pass
const itemsByDate = new Map<string, { categories: string[]; types: string[] }>();

for (const item of itemsThisMonth) {
  if (!item.startDate || !item.endDate) continue;
  
  const itemStartKey = toUTCDateKey(item.startDate);
  const itemEndKey = toUTCDateKey(item.endDate);
  
  // Only iterate the dates this item covers
  for (const dateStr of allDatesInMonth) {
    if (dateStr < itemStartKey || dateStr > itemEndKey) continue;
    
    const dayName = getDayNameFromDateStr(dateStr);
    if (item.days.length > 0 && !item.days.includes(dayName)) continue;
    if (!isWithinFrequencyLimit(item, dateStr)) continue;
    
    let entry = itemsByDate.get(dateStr);
    if (!entry) {
      entry = { categories: [], types: [] };
      itemsByDate.set(dateStr, entry);
    }
    if (item.eventCategory && !entry.categories.includes(item.eventCategory)) {
      entry.categories.push(item.eventCategory);
    }
    if (!entry.types.includes(item.itemType)) {
      entry.types.push(item.itemType);
    }
  }
}
```

**Risk:** Low. No breaking changes. Output format unchanged.
**Effort:** 2 hours.
**Expected Gain:** Calendar endpoint time reduced from O(n×d) to O(n×d_avg). For 100 items × 31 days, worst case same but with reduced overhead. For sparse items (common case), 50-80% faster.

### 3.2 Reduce Over-fetching in Schedule List

**Files to modify:** `src/app/modules/scheduleItem/scheduleItem.service.ts`

**Change:** Create separate select/schema for list view that excludes `user.userDetails`, `provider`, and minimizes `children` fields. Only include `userCompletedActivities` when explicitly needed.

**Implementation:** 
- `scheduleItemListSelect` — minimal fields for list
- `scheduleItemDetailSelect` — full fields for detail view

**Risk:** Low. Requires route/controller changes to use different selects.
**Effort:** 2 hours.
**Expected Gain:** Reduces response payload by 40-60% for list views. Reduces DB query time by 30-50% by avoiding relation queries.

### 3.3 Consolidate Analytics Queries

**Files to modify:** `src/app/modules/analytics/analytics.service.ts`

**Change:** Replace 4 separate queries with a single query that fetches all behavior logs in the period, then partitions in-memory by behavior type.

**Risk:** Low. Same data, same output format.
**Effort:** 1 hour.
**Expected Gain:** Reduces DB round trips from 4 to 1 for analytics endpoint. 50-75% reduction in analytics latency.

---

## Phase 4: Infrastructure & Queues (P2-P3 — MEDIUM RISK)

### 4.1 Production Build Pipeline

**Files to modify:** `Dockerfile`, `package.json`, `tsconfig.json`

**Change:** 
1. Add `npm run build` step that compiles TypeScript to `dist/`
2. Production Docker stage runs `node dist/server.js` instead of `npx tsx`
3. Ensure `NODE_ENV=production` is set

**Risk:** Medium. Requires build verification, potential type errors that weren't caught during development.
**Effort:** 3 hours.
**Expected Gain:** 40-60% reduction in memory usage (no JIT compilation overhead). 2-3× faster startup time.

### 4.2 Enable Node.js Clustering

**Files to modify:** `src/server.ts` or add `pm2` config

**Change:** Use `pm2` in cluster mode to utilize all CPU cores, or implement `cluster` module with worker count = `os.cpus().length`.

**Risk:** Medium. Requires testing for race conditions, file upload consistency, session affinity.
**Effort:** 2 hours.
**Expected Gain:** Near-linear throughput scaling up to available CPU cores. 4× throughput on 4-core machine.

### 4.3 Separate Worker Processes

**Files to modify:** New `worker.ts` entry point, `Dockerfile`, `docker-compose.yml`

**Change:** Create a separate Docker service for queue workers (`otpWorker`, `emailWorker`). Main app only runs web server.

**Risk:** Medium. Requires deployment changes, environment parity.
**Effort:** 4 hours.
**Expected Gain:** Web requests are no longer blocked by email sending or OTP processing. 20-30% improvement in API response time variability.

### 4.4 Add HTTP Caching Headers

**Files to modify:** `src/app.ts` or individual route handler

**Change:** Add `Cache-Control` headers to appropriate endpoints:
- `GET /subscriptions` → `public, max-age=3600`
- `GET /tasks/categories` → `public, max-age=86400`
- `GET /user/profile` → `private, max-age=60`
- List endpoints → `private, max-age=300`

**Risk:** Low.
**Effort:** 1 hour.
**Expected Gain:** Reduces redundant API calls from clients. Saves ~5-10% bandwidth.

---

## Phase 5: Additional Optimizations (P3-P4 — LOWER PRIORITY)

### 5.1 Add Dedicated Notification Queue

**Change:** Create BullMQ queue for push notifications. Replace synchronous notification sending with async job.

### 5.2 Cursor-Based Pagination

**Change:** Implement cursor-based pagination as an alternative to `skip/take` for deep pages. Return `nextCursor` in response meta.

### 5.3 Add S3/CDN File Uploads

**Change:** Use the existing S3 configuration to upload files to DigitalOcean Spaces / AWS S3. Replace local `express.static` with S3 signed URLs or CDN URLs.

### 5.4 Add Health/Readiness Endpoints

**Change:** Create `/health` and `/health/ready` endpoints that verify MongoDB connectivity, Redis ping, and queue health.

---

## Implementation Timeline

| Phase | Priority | Estimated Effort | Expected ROI |
|-------|----------|-----------------|--------------|
| Phase 1: Database Indexing | **P0** | 1 day | **Highest** — 80-95% query time reduction |
| Phase 2: Caching Gaps | **P1** | 2 days | **High** — 30-50% latency reduction on hot paths |
| Phase 3: Application Opt. | **P2** | 3 days | **High** — 40-60% reduction in calendar/analytics |
| Phase 4: Infrastructure | **P2-P3** | 5 days | **Medium-High** — 4× throughput, 50% memory |
| Phase 5: Additional | **P3-P4** | 5 days | **Low-Medium** — Incremental improvements |

**Total Estimated Effort:** ~16 days for all phases
**Quick Wins (Phases 1-2):** ~3 days for 80% of the total performance gain

---

## Measurement Plan

Before and after each phase, measure:

1. **DB Query Performance:** Enable Prisma query logging (`LOG_LEVEL=query`), capture slow queries
2. **API Response Times:** Use middleware to log per-endpoint response times
3. **Cache Hit Ratio:** `redis.INFO('stats')` — keyspace hits vs misses
4. **Memory Usage:** `process.memoryUsage()` before/after
5. **Queue Throughput:** BullMQ dashboard to track processed vs failed jobs
6. **Startup Time:** Application boot time to first ready response

### Benchmark Endpoints (Baseline)

| Endpoint | Current (est.) | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|----------|---------------|----------------|----------------|----------------|
| `GET /children?page=1` | 200ms | 20ms | 15ms | 15ms |
| `GET /schedule/by-date?date=2026-06-22` | 500ms | 200ms | 50ms | 50ms |
| `GET /schedule/monthly?month=2026-06` | 1000ms | 500ms | 200ms | 100ms |
| `GET /analytics?childId=X&period=week` | 300ms | 100ms | 50ms | 30ms |
| `GET /admin/users?page=1` | 1000ms | 200ms | 10ms | 10ms |

---

## Rollout Strategy

1. **Phase 1 (Indexes):** Apply to staging. Measure query times. Deploy to production with monitoring.
2. **Phase 2 (Caching):** Roll out one module at a time. Monitor cache hit ratio and error rates.
3. **Phase 3 (Application):** Test calendar and analytics changes with production data volume in staging.
4. **Phase 4 (Infrastructure):** Blue-green deployment. Keep old Dockerfile as fallback.
5. **Phase 5 (Additional):** Evaluate necessity based on production metrics.

---

## Approval Checklist

Before making any code changes, review and approve this plan:

- [ ] Phase 1: Database indexing confirmed safe for MongoDB
- [ ] Phase 2: Caching changes verified not to break existing functionality
- [ ] Phase 3: Application optimizations tested with edge cases
- [ ] Phase 4: Infrastructure changes reviewed by DevOps
- [ ] All phases: Rollback plan documented and ready