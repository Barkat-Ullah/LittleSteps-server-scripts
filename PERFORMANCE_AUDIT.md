# Performance Audit

## Scope

Static audit only. No runtime profiling, DB `explain` plans, or load tests have been run yet.

The review covered the Express app entrypoints, Prisma/MongoDB schema, Redis caching layer, BullMQ queues/workers, notification/SSE flow, and deployment configuration.

## Executive Summary

The highest-cost issues are concentrated in a few repeat patterns:

1. List endpoints almost always run a `findMany` plus a separate `count`, doubling database work for the same request.
2. `scheduleItem` date-based queries fetch broad result sets and then filter/paginate in application memory.
3. Cache behavior is inconsistent in a few places, including a shared `user:${id}` key for different response shapes and broad Redis pattern invalidation.
4. Notification and SSE paths do extra work that scales poorly with user count or connection count.
5. Some search patterns and pagination strategies are unlikely to use indexes effectively in MongoDB, which increases scan cost as data grows.

## Findings

| Priority | Area                         | Bottleneck                                                             | Evidence                                                                                                                                                                                          | Estimated Impact                                                                                       | Risk          | Recommended Fix                                                                                                                                       |
| -------- | ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Database / API               | Repeated `findMany` + `count` on most list endpoints                   | `user`, `task`, `scheduleItem`, `children`, `contact`, `favorite`, `lognote`, `healthCareNote`, `noteProvider`, `inspire`, `preferenceSensoryNote`, and others all use the same two-query pattern | High on read-heavy traffic; doubles query work and adds latency per request                            | Low to medium | Replace with cursor-based pagination where possible, cache counts separately when needed, or return `hasMore`/`nextCursor` instead of always counting |
| High     | Database / API               | `scheduleItem` by-date path over-fetches and filters in memory         | `getScheduleItemListByDate` loads all matching rows, then filters by recurrence/frequency and slices after the fact                                                                               | High for calendar-heavy users; can inflate DB work and memory use sharply                              | Medium        | Push more filtering into query shape, precompute recurrence windows, or materialize per-day indexes for the date view                                 |
| High     | Caching                      | Shared cache key for different user response shapes                    | `getUserDetailsFromDB` and `getMyProfileFromDB` both cache under `user:${id}` but return different projections                                                                                    | Medium to high; cache collisions cause stale/incomplete responses and unnecessary refetches            | Low           | Split cache keys by view shape, e.g. `user:details:${id}` and `user:profile:${id}`                                                                    |
| High     | Caching / Redis              | Broad pattern invalidation with `SCAN` on frequently mutated models    | `invalidatePattern`, `invalidateModel`, and repeated calls from mutation paths clear whole list namespaces                                                                                        | Medium to high as key volume grows; mutation latency becomes proportional to cache size                | Medium        | Replace broad invalidation with versioned keys or tighter namespaces; reserve pattern scans for infrequent maintenance                                |
| High     | Notification API             | Unpaginated notification reads and over-fetching sender data           | `getNotificationsFromDB` returns every notification for the user and includes `sender.email` even though only `sender.id` is returned                                                             | High when notification volume grows; payload size and serialization cost rise linearly                 | Low           | Add pagination/limit, return only needed sender fields, and consider unread-first ordering with cursor pagination                                     |
| Medium   | Notification API             | Extra query on single notification read path                           | `getSingleNotificationFromDB` does a `findFirst` and then an unconditional `update`                                                                                                               | Medium; unnecessary roundtrip on every open/read event                                                 | Low           | Update only after successful fetch, and prefer one transactional read-modify-write path                                                               |
| Medium   | SSE / Long-lived connections | Heartbeat loop iterates all clients every 20s and logs on each beat    | `sse.ts` stores connections in memory and performs global heartbeats without a singleton guard                                                                                                    | Medium under many concurrent SSE clients; adds CPU, write pressure, and log noise                      | Low           | Keep one heartbeat interval per process, make it resilient to hot reloads, and reduce logging frequency                                               |
| Medium   | Queues / Background jobs     | Duplicate queue-cleanup scheduling                                     | `cleanOtpQueue.ts` starts its own hourly interval, and `queueManager.ts` also schedules cleanup                                                                                                   | Medium; duplicate work and extra timers on the event loop                                              | Low           | Make cleanup scheduling single-owner and only enable it in worker/process bootstrap code                                                              |
| Medium   | Search / Indexing            | Search conditions rely on `contains` / case-insensitive matching       | Many list queries search on `contains` against fields like title, description, and email                                                                                                          | Medium to high as collections grow; these filters are hard to satisfy with ordinary indexes in MongoDB | Medium        | Use prefix-friendly search, denormalized search fields, or Atlas Search/text-index style strategies where appropriate                                 |
| Medium   | Database                     | Missing composite indexes for actual query shapes                      | Several queries filter by `userId`, `isDeleted`, `createdAt`, `status`, or date ranges, but the schema does not always match the full predicate/order pattern                                     | Medium; existing indexes may only partially help, causing scans or in-memory sorts                     | Medium        | Add compound indexes based on the real hot paths, after validating with query plans                                                                   |
| Medium   | Queue throughput             | Worker concurrency and throughput are fixed rather than workload-aware | `createWorker` uses concurrency 5 globally and one-size-fits-all rate limits                                                                                                                      | Medium for spikes; can underutilize resources or create bursts                                         | Medium        | Tune per-queue concurrency and add workload-specific limits and retry policies                                                                        |
| Low      | Startup / Infra              | Admin bootstrap runs on every API startup                              | `initiateAdmin()` performs a DB lookup and transaction on boot                                                                                                                                    | Low runtime impact, but adds boot latency and DB traffic                                               | Low           | Move bootstrapping to a one-off seed/migration path                                                                                                   |
| Low      | Infra / Build                | No measured runtime budget or autoscaling guardrails                   | Docker and compose are serviceable, but there is no documented SLO, pool sizing, or queue-worker capacity policy                                                                                  | Low to medium depending on deployment size                                                             | Medium        | Add runtime metrics, connection-pool guidance, worker sizing, and request/queue SLOs                                                                  |

## Root Cause Analysis

The dominant root causes are architectural rather than local bugs:

1. The codebase favors simple read patterns over query-specialized read models.
2. Pagination is usually offset-based with an always-on `count`, which is expensive at scale.
3. Cache invalidation is broad and namespace-based, which is easy to reason about but becomes costly as key volume increases.
4. Several endpoints optimize for correctness and convenience in application code instead of pushing the work into the database or a precomputed projection.
5. Long-lived processes such as SSE and queue workers create hidden background cost if intervals and cleanup loops are duplicated.

## Expected Gains By Theme

- List endpoints: lower database load and reduced p95 latency, especially on mobile-heavy or admin-heavy usage.
- `scheduleItem` date view: substantially lower payload size and less CPU spent filtering in memory.
- Cache fixes: fewer cache misses, fewer stale responses, and less Redis scan overhead during writes.
- Notification/SSE fixes: smaller response payloads, lower memory pressure, and fewer background writes.
- Index and search tuning: fewer collection scans and more stable latency as the dataset grows.

## Notes And Constraints

- Some schema fragments are already indexed well, so not every model needs immediate changes.
- Search-heavy filters using `contains` are likely the most index-resistant path in the current system.
- No refactor has been performed yet. This document is the evidence base for the next phase.
