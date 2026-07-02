# Performance Plan

## Goal

Improve latency, throughput, and operational cost without breaking existing functionality.

No code changes should start until this plan is approved.

## Principles

1. High impact, low risk first.
2. Preserve existing responses unless a pagination or caching contract must be tightened.
3. Validate each phase with a focused measurement before moving on.
4. Prefer query-shape fixes and cache key fixes before deeper structural refactors.

## Phase 0: Baseline And Instrumentation

Deliverables:

- Capture current p50/p95 latency for the hottest list endpoints.
- Record Redis hit rate, cache invalidation cost, and queue depth.
- Measure notification payload size and SSE connection count.
- Validate Mongo query plans for the busiest list queries.

Success criteria:

- We can compare each later change against a concrete baseline.

## Phase 1: Highest ROI, Lowest Risk

1. Split cache keys that currently collapse different response shapes into one key.
   - Primary target: user profile/detail caching.
   - Expected effect: fewer cache collisions, fewer stale reads, lower DB fallback rate.

2. Add pagination and field trimming to notification reads.
   - Primary target: notification list endpoint.
   - Expected effect: smaller payloads, lower serialization cost, less memory pressure.

3. Remove duplicate queue-cleanup scheduling and make cleanup ownership explicit.
   - Primary target: OTP queue cleanup path.
   - Expected effect: fewer timers, lower background CPU usage, cleaner worker lifecycle.

4. Add a singleton guard around the SSE heartbeat loop and reduce log chatter.
   - Primary target: SSE connections.
   - Expected effect: less event-loop overhead and less noisy logs.

5. Reduce redundant notification queries.
   - Primary target: single-notification read/update flow.
   - Expected effect: one less DB roundtrip per mark-read action.

## Phase 2: High Impact, Medium Risk

1. Rework the `scheduleItem` by-date path.
   - Move more filtering into the DB where possible.
   - Consider precomputed day buckets or a materialized calendar projection if recurrence logic remains complex.
   - Expected effect: major reduction in over-fetch and in-memory filtering.

2. Replace the always-count pagination pattern on hot list endpoints.
   - Use cursor pagination or `hasMore` checks on endpoints where totals are not essential.
   - Keep count queries only where the UX truly needs exact totals.
   - Expected effect: roughly halves DB work on those endpoints.

3. Tighten query-friendly indexes after validating real query plans.
   - Focus on `userId`, `isDeleted`, `createdAt`, `status`, and date-range hot paths.
   - Validate against the actual Mongo query shapes, not schema intuition alone.
   - Expected effect: fewer scans and more stable p95 under growth.

4. Improve search strategy for `contains` filters.
   - Use search-friendly projections or full-text/search-service patterns for the heaviest fields.
   - Expected effect: much better read scalability for search-heavy endpoints.

## Phase 3: Medium Impact, Higher Coordination Cost

1. Replace broad Redis pattern invalidation with versioned namespaces or more granular keys.
   - Expected effect: mutation cost no longer scales with cache cardinality.

2. Tune BullMQ worker concurrency per queue.
   - Split OTP, email, and subscription workloads by observed throughput.
   - Expected effect: better queue latency under bursty traffic and less contention.

3. Move boot-time admin creation into a seed/bootstrap path.
   - Expected effect: faster startup and less boot-time DB traffic.

4. Add deployment-level performance guardrails.
   - Document pool sizing, worker count, and memory ceilings.
   - Expected effect: fewer production surprises and easier scaling decisions.

## Validation Per Change

For each implemented item, record:

- Response time impact
- Throughput impact
- Memory impact
- Database load impact
- Redis load impact
- Infra cost impact

Recommended checks:

- `npm run build`
- A narrow endpoint smoke test or integration test for the touched route
- Mongo query-plan validation for any changed query shape
- Redis metrics review for any cache change
- Queue depth / worker throughput review for background-job changes

## Implementation Order Recommendation

1. Fix cache key collisions.
2. Paginate and trim notifications.
3. Remove duplicate timers and heartbeat duplication.
4. Rework schedule-item date querying.
5. Replace always-count pagination patterns.
6. Add or adjust indexes based on measured query plans.
7. Rework Redis invalidation and queue tuning.

## Approval Gate

Pause here and wait for approval before refactoring code.
