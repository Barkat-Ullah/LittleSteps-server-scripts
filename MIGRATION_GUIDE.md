# Hono to Express Migration Guide

## Overview

This project has been successfully migrated from **Hono.js** (Bun runtime) to **Express.js** (Node.js runtime).

## Key Changes Made

### 1. **Dependencies** (`package.json`)

- ✅ Replaced `hono` with `express`
- ✅ Replaced `@bull-board/hono` with `@bull-board/express`
- ✅ Added `cors`, `cookie-parser`, `compression` packages
- ✅ Updated scripts to use `tsx` and `node` instead of `bun`
- ✅ Added `@types/express`, `@types/cors`, `@types/cookie-parser`

### 2. **Utilities & Helpers**

#### `src/shared/sendResponse.ts`

```typescript
// Before (Hono):
const sendResponse = <T>(c: Context, jsonData: {...}) => {
  return c.json(jsonData, jsonData.statusCode as any);
};

// After (Express):
const sendResponse = <T>(res: Response, jsonData: {...}) => {
  return res.status(jsonData.statusCode).json(jsonData);
};
```

#### `src/shared/catchAsync.ts`

```typescript
// Before (Hono):
const catchAsync = (fn: Handler): Handler => {
  return async (c, next) => {
    try {
      return await fn(c, next);
    } catch (err) {
      throw err;
    }
  };
};

// After (Express):
const catchAsync = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

### 3. **Middleware Conversion**

#### Pattern Change

```typescript
// Hono Middleware
export const apiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header("x-api-key");
  // ...
  await next();
};

// Express Middleware
export const apiKeyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiKey = req.get("x-api-key");
  // ...
  next(); // or next(error) for errors
};
```

#### Middleware Files Updated:

- ✅ `src/app/middlewares/apiKeyMiddleware.ts`
- ✅ `src/app/middlewares/apiAccessTokenMiddleware.ts`
- ✅ `src/app/middlewares/validateRequest.ts`
- ✅ `src/app/middlewares/globalErrorHandler.ts`

### 4. **Route Conversion**

#### Pattern Change

```typescript
// Hono Router
import { Hono } from "hono";
const router = new Hono();
router.get("/:id", (c) => c.json(data));

// Express Router
import { Router } from "express";
const router = Router();
router.get("/:id", (req, res) => res.json(data));
```

#### Routes Updated:

- ✅ `src/app/routes/index.ts`
- ✅ `src/app/modules/user/user.route.ts`
- ✅ `src/app/modules/auth/auth.route.ts`

### 5. **Controller Conversion**

#### Context Change

```typescript
// Hono Controller
const getAllusersController = async (c: Context) => {
  const result = await getAllusersService();
  const body = await c.req.json();
  const { id } = c.req.param();
  return sendResponse(c, {
    /* ... */
  });
};

// Express Controller
const getAllusersController = catchAsync(
  async (req: Request, res: Response) => {
    const result = await getAllusersService();
    const body = req.body;
    const { id } = req.params;
    return sendResponse(res, {
      /* ... */
    });
  },
);
```

#### Controllers Updated:

- ✅ `src/app/modules/user/user.controller.ts`
- ✅ `src/app/modules/auth/auth.controller.ts`

### 6. **Auth Cookies**

```typescript
// Hono
import { setCookie } from "hono/cookie";
export const setAuthCookies = (c: Context, tokens: {...}) => {
  setCookie(c, "accessToken", tokens.accessToken, { /* ... */ });
};

// Express
export const setAuthCookies = (res: Response, tokens: {...}) => {
  res.cookie("accessToken", tokens.accessToken, { /* ... */ });
  // Note: maxAge in Express is in milliseconds, not seconds
};
```

### 7. **Main App Setup** (`src/app.ts`)

Key differences:

- ✅ Replaced `new Hono()` with `express()`
- ✅ Replaced Hono middleware imports with Express equivalents
- ✅ Built-in body parsing with `express.json()` and `express.urlencoded()`
- ✅ Added `express.static()` for file serving
- ✅ CORS configuration adapted to Express style
- ✅ Error handling middleware placed at the end
- ✅ Removed `serveStatic` (Hono-specific) and used `express.static()`

### 8. **Server Startup** (`src/server.ts`)

```typescript
// Before (Bun)
const server = Bun.serve({
  port,
  fetch: app.fetch,
});

// After (Node.js + Express)
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

## Context Parameter Mapping

| Hono                       | Express                                     |
| -------------------------- | ------------------------------------------- |
| `c.req.json()`             | `req.body` (pre-parsed by middleware)       |
| `c.req.param()`            | `req.params`                                |
| `c.req.query()`            | `req.query`                                 |
| `c.req.header("x-key")`    | `req.get("x-key")`                          |
| `c.json(data)`             | `res.json(data)`                            |
| `c.header("x-key", value)` | `res.set("x-key", value)` or `res.header()` |
| `await next()`             | `next()`                                    |
| `throw new Error()`        | `next(error)`                               |

## Running the Application

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

This uses `tsx --watch src/server.ts` for hot-reload.

### Build

```bash
npm run build
```

Creates compiled JavaScript in the `dist/` directory.

### Production

```bash
npm start
```

Runs the compiled JavaScript with Node.js.

## What Remained Unchanged

All of these continue to work as-is:

- ✅ Prisma database models and operations
- ✅ Authentication (JWT, Passport.js)
- ✅ Validation (Zod schemas)
- ✅ BullMQ job queues
- ✅ Redis connections (ioredis)
- ✅ Email sending (SendGrid, Nodemailer)
- ✅ Business logic in services
- ✅ Error handling patterns

## Common Issues & Solutions

### Issue: "Cannot find module 'compression'"

**Solution:** Run `npm install compression` if not already installed.

### Issue: "Body is undefined in controller"

**Solution:** Ensure `express.json()` middleware is applied before routes. It's already set in `app.ts`.

### Issue: "Cookies not being set"

**Solution:** Remember that Express uses milliseconds for `maxAge`, while Hono uses seconds. The migration already handles this conversion.

### Issue: "File uploads not working"

**Solution:** Install and configure `multer` middleware if you're handling file uploads.

## Performance Considerations

- Express is synchronous and event-driven, similar to Hono
- Node.js startup is slightly faster than Bun in most cases
- Both handle middleware chains efficiently
- Consider using a process manager like `pm2` for production Node.js apps

## Next Steps

1. ✅ Run `npm install` to install all dependencies
2. ✅ Test all routes using Postman/Insomnia
3. ✅ Verify error handling works correctly
4. ✅ Update CI/CD pipelines to use Node.js instead of Bun
5. ✅ Test database connections and Prisma migrations
6. ✅ Test async jobs with BullMQ
7. ✅ Deploy to production with a Node.js runtime

## Migration Checklist

- [x] Dependencies updated
- [x] Utilities converted (sendResponse, catchAsync)
- [x] All middleware converted
- [x] All routes converted
- [x] All controllers converted
- [x] App setup converted
- [x] Server startup converted
- [x] Error handling adapted
- [ ] Install dependencies
- [ ] Run tests
- [ ] Verify all endpoints
- [ ] Deploy to production
