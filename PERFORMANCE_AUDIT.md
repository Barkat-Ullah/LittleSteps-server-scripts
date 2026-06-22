# LittleSteps Server — Comprehensive Performance Audit

> **Date:** 2026-06-22  
> **Auditor:** Principal Software Architect & Performance Engineer  
> **System:** Node.js / Express / Prisma (MongoDB) / Redis / BullMQ

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Database Layer](#2-database-layer)
3. [Application Layer](#3-application-layer)
4. [Caching Strategy](#4-caching-strategy)
5. [Queues & Background Jobs](#5-queues--background-jobs)
6. [API Performance](#6-api-performance)
7. [Infrastructure & Deployment](#7-infrastructure--deployment)
8. [Asset & Frontend Considerations](#8-asset--frontend-considerations)
9. [Bottleneck Prioritization Matrix](#9-bottleneck-prioritization-matrix)

---

## 1. Executive Summary

This codebase uses **Prisma ORM with MongoDB**, a combination that introduces significant performance pitfalls. MongoDB lacks native join support, so Prisma emulates relations through additional queries. Combined with missing indexes, over-fetching, and uncached critical-path lookups, this creates multiple severe bottlenecks.

### Key Risk Areas

| Risk | Severity | Root Cause |
|------|----------|------------|
| Missing indexes on all frequently filtered fields | **Critical** | MongoDB requires explicit indexes for performant queries |
| Prisma MongoDB relation emulation (N+1) | **High** | Every `include`/`select` with relations generates separate DB queries |
| Un-cached `getEffectiveAccessId()` called on every request | **High** | Extra DB query per request, no TTL caching |
| No caching on admin user list / profile endpoints | **High** | Repeated full table scans |
| Inefficient monthly calendar algorithm | **Medium** | O(n×d) complexity with 3-layer per-date filtering |
| Missing compound indexes for common query patterns | **High** | Single-field indexes would drastically improve |

---

## 2. Database Layer

### 2.1 Index Analysis

#### Current Indexes

| Model | Indexes | 
|-------|---------|
| `User` | `@unique` on `email` (implicit) |
| `userSession` | `@@index([userId])`, `@@index([deviceId])` |
| `OAuthAccount` | `@@unique([provider, provideruserId])`, `@@index([userId])` |
| `BehaviorLog` | `@@index([childId, logDate])` |
| `ScheduleItem` | `@@index([status])`, `@@index([userId, childIds])`, `@@index([startDate, endDate])` |
| All other models | **None** |

#### Missing Critical Indexes

| Model | Fields Commonly Filtered | Impact |
|-------|-------------------------|--------|
| `Children` | `creatorId`, `isDeleted`, `email` | **CRITICAL** — Every children query scans entire collection |
| `Notification` | `receiverId`, `isRead`, `createdAt` | **HIGH** — Unread notification count query is a full scan |
| `Chat` | `roomId`, `senderId`, `receiverId` | **HIGH** — Chat queries are full collection scans |
| `Room` | `senderId`, `receiverId` | **HIGH** |
| `ScheduleItem` | `providerId` | **MEDIUM** |
| `favorite` | `userId`, `taskId` | **MEDIUM** — `findFirst` with two fields has no index |
| `userDetails` | `userId` | **LOW** — Only accessed via User relation |
| `Payment` | `userId`, `stripeSessionId` | **MEDIUM** — Unique constraint on stripeSessionId but no userId index |
| `UserSubscription` | `userId`, `subscriptionId` | **MEDIUM** — Unique composite constraint exists |
| `Task` | `userId`, `category`, `status` | **HIGH** — No indexes despite frequent filtering |

**Root Cause:** Prisma schema generation for MongoDB does not create indexes unless explicitly defined. All models except `userSession`, `OAuthAccount`, `BehaviorLog`, and `ScheduleItem` have **zero indexes**.

**Estimated Impact:** Every filtered query on index-less models performs a collection scan. For tables with 10k+ documents, queries take 200ms-2s instead of <10ms.

### 2.2 Missing Compound Indexes

Common query patterns that would benefit from compound (composite) indexes:

1. **`Children(creatorId, isDeleted)`** — Used by every children list query
2. **`ScheduleItem(userId, isDeleted, startDate, endDate)`** — The monthly calendar query
3. **`Notification(receiverId, isRead, createdAt)`** — Notification list queries
4. **`Chat(roomId, createdAt)`** — Chat message listing
5. **`favorite(userId, taskId)`** — Check favorite and list favorites
6. **`Task(userId, category, status)`** — Task filtering
7. **`Payment(userId, status, createdAt)`** — Payment history

### 2.3 N+1 Query Problems

**Problem 1: Schedule Item List with Relations**

In `scheduleItem.service.ts` → `getScheduleItemListByDate()` (lines 339-373):

```typescript
prisma.scheduleItem.findMany({
  select: {
    ...scheduleItemSelect,
    children: { where: { isDeleted: false }, select: { id, fullName, image } },
    user: { select: { id, role, userDetails: { select: { ... } } } },
    userCompletedActivities: { select: { isCompleted }, take: 1 },
    provider: { select: { id, fullName } },
  }
});
```

With MongoDB, this produces **at minimum 5 queries**: 1 for scheduleItem, 1 for children, 1 for user, 1 for userDetails (nested), 1 for userCompletedActivities, 1 for provider. For a page of 20 items, this balloons.

**Problem 2: Auth Middleware User Lookup**

In `auth.ts` (line 32-43), every request performs:
1. Token blacklist check (Redis, good)
2. User lookup via `cacheOr` (good, cached)
3. Session validation via Redis (line 52-68) with fallback to DB

While this is partially mitigated by caching, the session fallback to DB on cache miss adds latency.

### 2.4 Inefficient Queries

**Issue: Monthly Calendar Algorithm (`getMonthlyScheduleItems` — lines 480-581)**

```
1. Fetch ALL items overlapping month range  ──┐
2. Generate all 28-31 date strings            │
3. For EACH date, iterate ALL items:          │  O(n × d)
   - Check date range                          │
   - Check day name match                      │
   - Check daysPWeek frequency                 │
   - Push categories                           │
```

**Impact:** For 100 items × 31 days = 3,100 iterations of the inner loop. As data grows to 1000 items, this becomes 31,000 iterations — all in-memory and synchronous, blocking the event loop.

**Fix:** Pre-compute date → items mapping in a single pass (O(n + d)), use a lookup Map.

**Issue: Analytics Queries (4 separate queries)**

`getAnalyticsByPeriod` makes 4 separate queries for potty, foods, positive, calm. With indexes on `childId + logDate`, a single query could return all behavior logs in the period, then partition in-memory. For small periods (week/month) with <500 logs, one query is faster.

### 2.5 Over-fetching

- `scheduleItemSelect` is used for both list and detail views. List views often need only title, date, status — not all fields.
- `userCompletedActivities` is fetched for every item in the list (line 364-368) but only `isCompleted` of the most recent is used.
- The `user` relation in list view (lines 351-363) fetches `userDetails` (firstName, lastName, files) — only needed in detail view.

### 2.6 Pagination Strategy

Current pagination uses `skip/take` (offset-based), which degrades on deeper pages:

```typescript
const skip: number = (Number(page) - 1) * limit;
```

**Impact:** For page 100 with limit 20, MongoDB must skip 1,980 documents before returning results. With MongoDB's lack of efficient offset, this can be 50-200ms per deep page.

**Recommended:** Implement cursor-based pagination for deep pages, or limit max page depth.

---

## 3. Application Layer

### 3.1 Critical Uncached Lookup: `getEffectiveAccessId()`

**File:** `helpers/careGiverAccessor.ts` (lines 6-33)

Called on **every** schedule item request (create, update, list by date, monthly, toggle status, delete). Performs an uncached `prisma.user.findUnique` with role + createdBy.

For a user loading the daily schedule (potentially many API calls), this duplicates the user lookup:

| Call Path | Occurrences |
|-----------|-------------|
| `auth` middleware | 1 (cached via `cacheOr` ✓) |
| `getScheduleItemListByDate` | 1 via `resolveAccessId` ✗ |
| `getMonthlyScheduleItems` | 1 via `resolveAccessId` ✗ |
| `createScheduleItem` | 1 via `resolveAccessId` ✗ |

**Impact:** Each occurrence adds ~10-50ms latency. For caregiver users, 1000 requests/day = 10-50 seconds wasted.

**Fix:** Integrate `getEffectiveAccessId` into the auth middleware user cache (already fetched there).

### 3.2 Unnecessary Object Creation & Duplicate Computation

**Issue: Hourly Clean Queue Timer**

In `queueManager.ts` (line 19-26), `setInterval` runs a queue cleaner every hour. This holds a reference to the otpQueue and doesn't check if otpQueue is still active. If the queue has been closed, this will throw errors.

**Issue: Repeated `paginationHelper.calculatePagination()`**

Every list endpoint calculates pagination the same way (lines 50-58 in children, similar in all services). This creates a new object for every request — acceptable, but could be a middleware.

**Issue: `buildFilterConditions()` pattern**

Each module duplicates the same filter-building pattern. For some filters (e.g., `createdAt` as date range), inline string-to-Date conversion is likely missing optimization.

### 3.3 Serialization & Validation

- **Validation:** Zod schemas used in middleware — good, adds minimal overhead.
- **Serialization:** Express `res.json()` uses `JSON.stringify()` internally, which is adequate.
- **Payload compression:** `compression()` middleware is enabled (line 63 of app.ts) — good for large responses.

### 3.4 Event/Listener Performance

No event listeners (EventEmitter) found in the codebase. Requests are synchronous Express handlers. This is a missed opportunity for parallelism — especially for the analytics endpoint which could emit events to aggregate results.

---

## 4. Caching Strategy

### 4.1 Redis Cache Architecture (Well-Designed but Underutilized)

The `cacheOr` function (redisConnection.ts lines 145-211) is **well-implemented** with:
- ✅ Cache penetration protection (negative caching for nulls)
- ✅ Cache stampede protection (pending fetches Map)
- ✅ Cache avalanche protection (random TTL jitter)
- ✅ BATCHED SCAN invalidation (never uses `KEYS`)
- ✅ Graceful degradation (try/catch around Redis operations)

### 4.2 Modules Using Caching

| Module | Cache Implementation | Coverage |
|--------|---------------------|----------|
| `children` | Full (list, detail, mylist) | ✅ Complete |
| `scheduleItem` | Full (list, detail, mylist, byDate, monthly) | ✅ Complete |
| `favorite` | Full (list, detail, mylist, check) | ✅ Complete |
| `analytics` | Full (by period) | ✅ Complete |
| `auth` | Partial (user cache, session cache, blacklist) | ⚠️ Session TTL may be too short |
| `user` | **None** (except inline `redis.del` on updates) | ❌ Missing |
| `subscription` | **Not reviewed yet** | ❓ |
| `host` | **Not reviewed yet** | ❓ |
| All other modules | **Not reviewed yet** | ❓ |

### 4.3 Critical Cache Gaps

**Gap 1: User Module (No Caching)**

`getAllUsersFromDB`, `getUserDetailsFromDB`, `getMyProfileFromDB` — none use `cacheOr`. Admin endpoints that list all users perform full table scans of the User collection.

**Impact:** Every admin dashboard reload fetches all users from MongoDB. With 10k users, this can take 500ms-2s.

**Gap 2: Auth Middleware Session Cache TTL**

```typescript
redis.setex(`session:${verifiedUser.sessionId}`, TTL.SHORT, "valid");
// TTL.SHORT = 5 minutes
```

Session cache only lives 5 minutes. If a user makes multiple requests within a minute, the first may miss cache and hit DB. Consider `TTL.MEDIUM` (30 min) for sessions.

### 4.4 Cache Invalidation Strategy

Invalidation pattern is thorough: 
- Creates invalidate model lists and single records
- Updates invalidate both
- Deletes invalidate record + lists + user's personal lists

**Issue:** `onRecordCreate` invalidates the **entire** model cache (all pages). For high-frequency writes (e.g., behavior logs), this flushes the cache frequently, reducing cache hit ratio.

**Impact:** If behavior logs are added 1000 times/day, cache for "recent logs" is invalidated 1000 times, causing DB reads for every subsequent list request until cache repopulates.

---

## 5. Queues & Background Jobs

### 5.1 Current Queue Infrastructure

| Queue | Purpose | Workers | 
|-------|---------|---------|
| `otpQueue` | OTP email sending | `otpWorker` |
| `mailQueue` | General email sending | `emailWorker` |

### 5.2 Analysis

**Issue 1: No Batch Processing**

All jobs are processed one at a time. For bulk operations (e.g., sending 1000 notification emails), each job is handled individually with full overhead.

**Issue 2: No Notification Queue**

A notification queue is commented out (line 62 of queueManager.ts). Push notifications are likely sent synchronously in request handlers, blocking the response.

**Issue 3: Queue Cleaner Interval**

The `setInterval` at line 19 runs regardless of whether the queue is being used. If the application has been running for days, this creates unnecessary overhead.

**Issue 4: Graceful Shutdown Race Condition**

```typescript
await otpQueue.close();
await mailQueue.close();
await redis.quit();
```

If `redis.quit()` is called before queue close completes, the queue close may fail trying to communicate with Redis.

### 5.3 Missing Queue Use Cases

- **Notification delivery** (push/email) — should always be async
- **Analytics aggregation** — should be computed asynchronously, not on-demand
- **File processing** (image resizing, PDF generation) — should be queued
- **Cache warming** — after invalidation, proactively repopulate cache

---

## 6. API Performance

### 6.1 Endpoint Response Times (Estimated)

| Endpoint | DB Queries | Cacheable | Est. Response Time | Bottleneck |
|----------|-----------|-----------|-------------------|------------|
| `GET /children` | 2 (findMany + count) | Yes (5 min) | 50-200ms | No indexes |
| `GET /children/:id` | 1 findUnique | Yes (30 min) | 10-50ms | Low |
| `GET /schedule/by-date` | 6+ (main + relations) | Yes (5 min) | 200-500ms | N+1 queries |
| `GET /schedule/monthly` | 1 findMany + O(n×d) loop | Yes (30 min) | 300-1000ms | Algorithmic |
| `GET /analytics` | 4 queries | Yes (5 min) | 100-300ms | Multiple queries |
| `GET /user/profile` | 1 findUnique | **NO** | 10-50ms | Uncached |
| `GET /admin/users` | 2 (findMany + count) | **NO** | 200-1000ms | No indexes + uncached |
| `POST /schedule` | 3+ validations + 1 create | N/A | 100-300ms | Multiple validations |
| `GET /notifications` | 2 (findMany + count) | **NO** | 50-200ms | No indexes |
| `GET /chat/:roomId` | 1 findMany | **NO** | 50-200ms | No indexes |

### 6.2 Payload Size & Serialization

- **Compression:** Enabled (good)
- **Over-fetching in list views:** See §2.5
- **Nested relations in list responses:** `scheduleItem` list includes user details, provider info, completion status — most fields unused by list consumers

### 6.3 HTTP Caching Opportunities

Currently no HTTP caching headers (`Cache-Control`, `ETag`) are set on any endpoint. For static/rarely-changing data:

- **Subscription plans** — could be cached for 1 hour client-side
- **Task categories** — could be cached for 24 hours
- **Children list** — could use `ETag` based on `updatedAt`

---

## 7. Infrastructure & Deployment

### 7.1 Docker & Runtime

| Observation | Severity | Details |
|-------------|----------|---------|
| Running TypeScript directly via `tsx` | **HIGH** | `npx tsx src/server.ts` bypasses compilation. This uses 2-3x more memory, slower startup, and no type checking at runtime. Should compile to JS and run `node dist/server.js`. |
| Single process (no clustering) | **MEDIUM** | Only one CPU core utilized. Use `pm2` or Node.js `cluster` module to utilize all cores. |
| No `NODE_ENV=production` build step | **HIGH** | The `tsconfig.json` likely has dev settings. A production build would strip comments, apply stricter checks, and output JS. |
| MongoDB connection pooling defaults | **MEDIUM** | Prisma uses default connection pool size (typically 10 for MongoDB). For high concurrency, this may need tuning. |
| No memory limits in Docker | **MEDIUM** | Container can use host's entire memory. No `--memory` flag set. Risk of OOM kills. |

### 7.2 Connection Pooling

Prisma's MongoDB connector uses a single connection pool. The default size is not explicitly configured. For serverless or high-concurrency deployments, this can become a bottleneck.

**Recommendation:** Set `connection_limit` in `DATABASE_URL` and configure pool size based on expected concurrent requests.

### 7.3 Worker Configuration

No dedicated worker processes. Email and OTP workers run in the same process as the web server. This means:

- Heavy email processing blocks API requests
- No horizontal scaling of workers independently from web servers
- Queue processing competes with HTTP request handling for event loop time

### 7.4 Container Optimization

The Dockerfile uses **multi-stage build** (good). However:
- `npm ci` falls back to `npm install` if lockfile is missing — this can be unpredictable
- `--ignore-scripts` prevents postinstall scripts but may miss required build steps
- No `.dockerignore` for `node_modules` (though COPY handles it)

---

## 8. Asset & Frontend Considerations

### 8.1 File Upload Handling

Current upload flow:
1. `multer` saves files to disk (`./upload/`)
2. File references stored as strings in DB
3. Files served via `express.static('./upload')`

**Issues:**
- No file size limits beyond HTTP body limit (1MB default)
- No file type validation visible in middleware
- Stored on local disk — **not scalable** across multiple instances
- S3 configuration exists but seems unused for uploads
- No CDN integration for static assets

### 8.2 Static Assets

- No bundling/minification step visible
- No cache headers for static files
- No CDN configuration

---

## 9. Bottleneck Prioritization Matrix

| Priority | Issue | Impact | Risk | Effort | Category |
|----------|-------|--------|------|--------|----------|
| **P0** | Missing indexes on `Children`, `Notification`, `Chat`, `Task`, `favorite` | **Critical** | Low | Low | Database |
| **P1** | Missing indexes on schedule-specific fields (`providerId`, composite `userId+isDeleted+date`) | **Critical** | Low | Low | Database |
| **P1** | `getEffectiveAccessId()` uncached — called on every schedule request | **High** | Low | Low | Caching |
| **P1** | User admin/profile endpoints have no caching | **High** | Low | Low | Caching |
| **P2** | Monthly calendar O(n×d) algorithm | **High** | Low | Low | Application |
| **P2** | N+1 query pattern in schedule list (multiple relation fetches) | **High** | Medium | Medium | Database |
| **P2** | Over-fetching in list views (unused nested relations) | **Medium** | Low | Low | API |
| **P2** | Cursor-based pagination not available for deep pages | **Medium** | Low | Medium | Database |
| **P2** | Missing compound indexes for common query patterns | **High** | Low | Low | Database |
| **P3** | Running TypeScript directly in production (`tsx`) | **Medium** | Low | Low | Infra |
| **P3** | Single process (no clustering) | **Medium** | Low | Low | Infra |
| **P3** | Notification queue commented out — synchronous delivery | **Medium** | Medium | Medium | Queue |
| **P3** | No HTTP caching headers on any endpoint | **Medium** | Low | Low | API |
| **P3** | Analytics 4 separate queries could be combined | **Low** | Low | Medium | Database |
| **P3** | Auth session cache TTL too short | **Low** | Low | Low | Caching |
| **P4** | No dedicated worker processes | **Medium** | Medium | High | Infra |
| **P4** | Local file storage not scalable | **Medium** | High | High | Infra |
| **P4** | No CDN for assets | **Low** | Low | Medium | Infra |
| **P4** | Missing health/readiness endpoints for k8s | **Low** | Low | Low | Infra |