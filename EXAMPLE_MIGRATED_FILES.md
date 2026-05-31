# Example: Migrated Files

## 1. Updated Server File (`src/server.ts`)

```typescript
import { config } from "./config";
import app from "./app";

function main() {
  try {
    const desiredPort = Number(config.port || 5000);

    const tryListen = (port: number) => {
      return new Promise<{ port: number }>((resolve, reject) => {
        const server = app.listen(port, () => {
          resolve({ port });
        });

        server.on("error", (err: any) => {
          reject(err);
        });
      });
    };

    tryListen(desiredPort)
      .then((result) => {
        console.log(`🚀 Server running on http://localhost:${result.port}`);
      })
      .catch(async (err: any) => {
        if (err?.code !== "EADDRINUSE") {
          throw err;
        }

        // If the preferred port is busy, automatically try the next few ports.
        for (let offset = 1; offset <= 20; offset++) {
          const port = desiredPort + offset;
          try {
            const result = await tryListen(port);
            console.warn(
              `⚠️ Port ${desiredPort} is in use; switched to ${result.port}`,
            );
            console.log(`🚀 Server running on http://localhost:${result.port}`);
            return;
          } catch (e: any) {
            if (e?.code !== "EADDRINUSE") {
              throw e;
            }
          }
        }

        // Final fallback: use ephemeral port (0 = OS chooses)
        try {
          const result = await tryListen(0);
          console.warn(
            `⚠️ Ports ${desiredPort}-${desiredPort + 20} are in use; switched to ${
              result.port
            }`,
          );
          console.log(`🚀 Server running on http://localhost:${result.port}`);
        } catch (e) {
          console.error("❗ Server startup error:", e);
          process.exit(1);
        }
      });
  } catch (error) {
    console.error("❗ Server startup error:", error);
    process.exit(1);
  }
}

main();
```

## 2. Example Route: user Routes (`src/app/modules/user/user.route.ts`)

```typescript
import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import {
  deleteuserController,
  getAllusersController,
  getuserByIdController,
  updateuserController,
  updateuserEmailController,
  updateuserPasswordController,
} from "./user.controller";
import { userValidation } from "./user.validation";

const userRouter = Router();

//  get all user
userRouter.get("/all", getAllusersController);

// get user by id
userRouter.get(
  "/:id",
  validateRequest(userValidation.getuserByIdSchema),
  getuserByIdController,
);

// update user by id
userRouter.put(
  "/:id",
  validateRequest(userValidation.updateuserSchema),
  updateuserController,
);

// delete user by id
userRouter.delete(
  "/:id",
  validateRequest(userValidation.deleteuserSchema),
  deleteuserController,
);

// update user password
userRouter.patch(
  "/:id/password",
  validateRequest(userValidation.updateuserPasswordSchema),
  updateuserPasswordController,
);

// update user email
userRouter.patch(
  "/:id/email",
  validateRequest(userValidation.updateuserEmailSchema),
  updateuserEmailController,
);

export default userRouter;
```

## 3. Example Controller: user Controller (`src/app/modules/user/user.controller.ts`)

```typescript
import type { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import {
  deleteuserByIdService,
  getAllusersService,
  getuserByIdService,
  updateuserByIdService,
  updateuserEmailService,
  updateuserPasswordService,
} from "./user.service";

// get all user controller
const getAllusersController = catchAsync(
  async (req: Request, res: Response) => {
    const result = await getAllusersService();

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "users retrieved successfully",
      data: result,
    });
  },
);

const getuserByIdController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await getuserByIdService(id);

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "user retrieved successfully",
      data: result,
    });
  },
);

const updateuserController = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;
  const result = await updateuserByIdService(id, body);

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "user updated successfully",
    data: result,
  });
});

const deleteuserController = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteuserByIdService(id);

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "user deleted successfully",
    data: result,
  });
});

const updateuserPasswordController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body;
    const result = await updateuserPasswordService(id, body.password);

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Password updated successfully",
      data: result,
    });
  },
);

const updateuserEmailController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body;
    const result = await updateuserEmailService(id, body.email);

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Email updated successfully",
      data: result,
    });
  },
);

export {
  getAllusersController,
  getuserByIdController,
  updateuserController,
  deleteuserController,
  updateuserPasswordController,
  updateuserEmailController,
};
```

## 4. Key Differences Side-by-Side

### Request Context Access

| Task                 | Hono                              | Express                        |
| -------------------- | --------------------------------- | ------------------------------ |
| Get path parameters  | `c.req.param()` → `{ id: "123" }` | `req.params` → `{ id: "123" }` |
| Get query strings    | `c.req.query()` → `{ page: "1" }` | `req.query` → `{ page: "1" }`  |
| Get JSON body        | `await c.req.json()`              | `req.body` (pre-parsed)        |
| Get header           | `c.req.header("authorization")`   | `req.get("authorization")`     |
| Send JSON response   | `c.json(data, 200)`               | `res.status(200).json(data)`   |
| Set header           | `c.header("x-custom", "value")`   | `res.set("x-custom", "value")` |
| Call next middleware | `await next()`                    | `next()`                       |
| Handle errors        | `throw new Error()`               | `next(error)`                  |

### Middleware Definition

**Hono:**

```typescript
const middleware: MiddlewareHandler = async (c, next) => {
  console.log(c.req.method);
  await next();
};

app.use("/path", middleware);
```

**Express:**

```typescript
const middleware = (req: Request, res: Response, next: NextFunction) => {
  console.log(req.method);
  next();
};

app.use("/path", middleware);
```

### Error Handling

**Hono:**

```typescript
app.onError((err, c) => {
  return c.json({ error: err.message }, 500);
});
```

**Express:**

```typescript
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({ error: err.message });
});
```

## 5. Testing Endpoints

### Example: Get All users

**Request:**

```bash
curl -X GET http://localhost:5000/api/v1/users/all \
  -H "X-API-Key: your-api-key" \
  -H "X-API-Access-Token: your-access-token"
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "users retrieved successfully",
  "data": [
    {
      "id": "user-1",
      "email": "user@example.com",
      "name": "John Doe"
    }
  ]
}
```

### Example: Get user by ID

**Request:**

```bash
curl -X GET http://localhost:5000/api/v1/users/123 \
  -H "X-API-Key: your-api-key" \
  -H "X-API-Access-Token: your-access-token"
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "user retrieved successfully",
  "data": {
    "id": "123",
    "email": "user@example.com",
    "name": "John Doe",
    "createdAt": "2025-04-24T10:30:00Z"
  }
}
```

### Example: Update user

**Request:**

```bash
curl -X PUT http://localhost:5000/api/v1/users/123 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "X-API-Access-Token: your-access-token" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com"
  }'
```

**Response:**

```json
{
  "statusCode": 200,
  "success": true,
  "message": "user updated successfully",
  "data": {
    "id": "123",
    "email": "jane@example.com",
    "name": "Jane Doe",
    "updatedAt": "2025-04-24T11:00:00Z"
  }
}
```

## 6. Debugging

### Enable Logging

In development environment (`config.env !== "production"`):

- Request logging is automatically enabled
- All API calls to `/api/v1/*` will be logged
- Error stack traces are included in responses

### Common Issues & Solutions

**Issue: "Cannot POST /api/v1/users"**

- Check that `app.use(express.json())` is in app.ts before routes
- Verify that the route is properly mounted in the router

**Issue: "Cannot read property 'body' of undefined"**

- Ensure body parsing middleware is applied: `app.use(express.json())`
- Check Content-Type header is set to `application/json`

**Issue: Cookies not persisting**

- Verify `cookieParser` middleware is applied: `app.use(cookieParser())`
- Check that cookies are being set with `res.cookie()`
- Verify sameSite and secure settings match your environment

## 7. TypeScript Configuration

The project maintains full TypeScript support:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020"],
    "declaration": true,
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

All Express types are automatically inferred from `@types/express`.
