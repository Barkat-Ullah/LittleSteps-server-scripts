# Payment & Subscription — Code Review Issues & Fixes

> Code reviewed & fixed on 2026-06-23
>
> All files updated:
> - ✅ `prisma/subscription.prisma`
> - ✅ `src/app/modules/subscription/subscription.service.ts`
> - ✅ `src/app/modules/subscription/subscription.controller.ts`
> - ✅ `src/lib/stripeWebhook.ts` — both handlers
> - ✅ `src/helpers/worker/suscription.worker.ts`

---

## Issue 1 — Webhook Idempotency is Unused

**Status: ✅ FIXED**

Both `stripeWebhookForInApp` and `stripeWebhookForLink` wrap their switch blocks in `withIdempotency(event.id, ...)`.

---

## Issue 2 — `stripeWebhookForInApp` Missing All Idempotency

**Status: ✅ FIXED**

Same as Issue 1.

---

## Issue 3 — `invoice.finalized` and `invoice.payment_succeeded` Race in `stripeWebhookForInApp`

**Status: ✅ FIXED**

- `invoice.finalized` case now logs "skipped" and does nothing.
- `activateSubscription` has `isSubscriptionActive()` guard — skips if `endDate > now()`.

---

## Issue 4 — `buySubscriptionInApp` Still Uses Queue for Core Payment Creation

**Status: ✅ FIXED**

Now creates Payment record → calls Stripe synchronously → returns `paymentId` to client. Queue used only for notifications.

---

## Issue 5 — `invoice.payment_failed` Uses Wrong Field

**Status: ✅ FIXED**

Changed `stripeSessionId` → `stripeSubscriptionId` in both webhooks.

---

## Issue 6 — `updateInAppPurchasePlanData` Bypasses Stripe Verification

**Status: ⚠️ NOT FIXED (per request)**

---

## Issue 7 — `stripeWebhookForInApp` Never Stores `stripeSubscriptionId`

**Status: ✅ FIXED**

`stripeSubscriptionId: stripeSubId` now saved in Payment records.

---

## Issue 8 — Race Condition Between Worker and Webhook

**Status: ✅ FIXED**

Payment record created **before** Stripe API call in `buySubscriptionInApp`. Webhook `updateMany` always finds a match.

---

## Issue 9 — `cancelPlan` Does Hard Delete

**Status: ✅ FIXED**

Soft-delete: sets `endDate: new Date()` instead of `delete()`.

---

## Issue 10 — `checkout.session.completed` No Duplicate Guard

**Status: ✅ FIXED**

Wrapped in `withIdempotency(event.id, ...)`.

---

## Optimizations Applied (Second Pass)

### ✅ Opt 1 — Notification moved from service to webhook

**Critical behavioral fix.** Previously `buySubscriptionInApp` queued "Payment Successful 🎉" immediately after creating a Stripe Subscription with `payment_behavior: "default_incomplete"`. If the first payment failed, the user would still receive a false success notification.

**Now:** Notifications are only queued from the webhook handlers — after Stripe confirms payment:
- `payment_intent.succeeded` (InApp lifetime)
- `invoice.payment_succeeded` (InApp subscription + renewal)
- `checkout.session.completed` (Link checkout + lifetime)
- `invoice.payment_succeeded` (Link renewal)

A `queuePaymentNotification()` helper was added to both webhook handlers.

### ✅ Opt 2 — `isLifeTime` added to `getSubscriptionList` select

Frontend can now differentiate lifetime vs recurring plans.

### ✅ Opt 3 — `OR` wrapper removed from `invoice.payment_failed`

Simplified `OR: [{ stripeSubscriptionId: stripeSubId }]` → `stripeSubscriptionId: stripeSubId`.

### ✅ Opt 4 — Stub functions handled

- `createSubscription` controller returns a placeholder response (route requires it).
- `getUserSubscriptionList` controller returns an empty array (route requires it).
- Their empty implementations in the service were removed to reduce confusion.

### ✅ Opt 5 — Duplicate notification risk eliminated

Since notifications now only fire from webhooks (which are idempotent), there's no risk of duplicate notifications between `buySubscriptionInApp` and `updateInAppPurchasePlanData`.

---

## Final Status

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `withIdempotency` helper defined but never called | Critical | ✅ Fixed |
| 2 | `stripeWebhookForInApp` has zero idempotency | Critical | ✅ Fixed |
| 3 | `invoice.finalized` and `invoice.payment_succeeded` double-activation | High | ✅ Fixed |
| 4 | `buySubscriptionInApp` routes through Queue → race + no sync | High | ✅ Fixed |
| 5 | `invoice.payment_failed` wrong field → never matches | High | ✅ Fixed |
| 6 | `updateInAppPurchasePlanData` no Stripe verification | High | ⚠️ Skipped |
| 7 | `stripeSubscriptionId` never stored in Payment | Medium | ✅ Fixed |
| 8 | Worker creates Payment async → webhook race | Medium | ✅ Fixed |
| 9 | `cancelPlan` hard delete → no audit trail | Medium | ✅ Fixed |
| 10 | `checkout.session.completed` no duplicate guard | Medium | ✅ Fixed |
| Opt 1 | Premature "Payment Successful" notification | Medium | ✅ Fixed |
| Opt 2 | `isLifeTime` missing from list select | Low | ✅ Fixed |
| Opt 3 | Unnecessary `OR` wrapper | Low | ✅ Fixed |
| Opt 4 | Stub functions cleaned up | Low | ✅ Fixed |
| Opt 5 | Duplicate notification risk | Low | ✅ Fixed |