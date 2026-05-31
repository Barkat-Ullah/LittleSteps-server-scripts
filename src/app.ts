// src/app.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import router from "./app/routes";
import GlobalErrorHandler from "./app/middlewares/globalErrorHandler";
import { config } from "./config";
import prisma from "./shared/prisma";
import {
  initializeQueueSystem,
  setupGracefulShutdown,
} from "./helpers/queue-manager/queueManager";
import status from "http-status";
import sendResponse from "./shared/sendResponse";
import { initiateAdmin } from "./app/db";
import {
  stripeWebhookForInApp,
  stripeWebhookForLink,
} from "./lib/stripeWebhook";

const app = express();

app.post(
  "/api/v1/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookForInApp,
);

app.post(
  "/api/v1/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookForLink,
);

const normalizeOrigin = (value?: string) => {
  if (!value) return "";
  // Origins never include a trailing slash; env URLs often do.
  return value.trim().replace(/\/+$/, "");
};

const shouldSkipHeavyApiMiddleware = (requestPath: string) => {
  // Uploads are streamed to disk; avoid small global body limits/timeouts.
  return requestPath.startsWith("/api/v1/uploads");
};

initiateAdmin();

// --------------------
// Built-in Middlewares
// --------------------

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: config.http.max_body_size }));
app.use(
  express.urlencoded({ extended: true, limit: config.http.max_body_size }),
);

// Parse cookies
app.use(cookieParser());

// Compression
app.use(compression());

// Serve uploaded files publicly: /upload/...
app.use("/upload", express.static("./upload"));

// Request ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.get("x-request-id");
  const requestId = incoming?.trim()
    ? incoming.trim()
    : globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  (req as any).requestId = requestId;
  res.set("X-Request-Id", requestId);
  next();
});

// Security headers
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Request timeout middleware for API routes
const requestTimeoutMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (shouldSkipHeavyApiMiddleware(req.path)) {
    return next();
  }
  req.setTimeout(config.http.request_timeout_ms);
  next();
};

app.use("/api/v1/*", requestTimeoutMiddleware);
app.use("/api/v1", requestTimeoutMiddleware);

// CORS configuration
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Non-browser clients may not send Origin.
    if (!origin) {
      return callback(null, true);
    }

    // Prefer a strict allow-list in production.
    const allowed = normalizeOrigin(config.frontend_url);
    if (allowed && normalizeOrigin(origin) === allowed) {
      return callback(null, true);
    }
    if (config.env !== "production") {
      return callback(null, true);
    }
    callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-API-Access-Token",
    "X-API-Key",
    "X-Device-Id",
    "X-Request-Id",
  ],
  credentials: Boolean(config.frontend_url),
};

app.use("/api/v1/*", cors(corsOptions));
app.use("/api/v1", cors(corsOptions));

// Logger middleware (for development)
if (config.env !== "production") {
  app.use("/api/v1/*", (req: Request, res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// Default to JSON content type
app.use("/api/v1/*", (req: Request, res: Response, next: NextFunction) => {
  if (!res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", "application/json");
  }
  next();
});
app.use("/api/v1", (req: Request, res: Response, next: NextFunction) => {
  if (!res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", "application/json");
  }
  next();
});

initializeQueueSystem();
setupGracefulShutdown();

// Warm up Prisma connection to avoid first-request latency spikes.
prisma.$connect().catch((err) => {
  console.error("❌ Prisma connection error:", (err as any)?.message ?? err);
});

// --------------------
// Routes
// --------------------

// Root route
app.get("/status", (req: Request, res: Response) => {
  return sendResponse(res, {
    statusCode: status.OK,
    success: true,
    message: "API is running ✅",
  });
});

// Mount the main router under /api/v1
app.use("/api/v1", router);

// Catch-all 404 middleware
app.use((req: Request, res: Response) => {
  return sendResponse(res, {
    statusCode: 404,
    success: false,
    message: `Cannot ${req.method} ${req.url}`,
  });
});

// Global error handler (must be last)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  GlobalErrorHandler(err, req, res, next);
});

export default app;
