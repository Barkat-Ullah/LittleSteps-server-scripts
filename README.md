# Express Backend Starter (API v1)

Node.js + Express backend starter with:

- Prisma (MongoDB)
- BullMQ queues (OTP + email) backed by Redis
- Zod request validation + centralized error handling
- Simple API protection via `X-API-Key` + `X-API-Access-Token`

## Tech Stack

- Runtime: Node.js
- Framework: Express
- Database: MongoDB via Prisma
- Queues: BullMQ + Redis, with Bull Board UI
- Validation: Zod
- Auth helpers: JWT helpers + Passport (Google/Facebook routes)

## Requirements

- Node.js installed
- MongoDB connection string for `DATABASE_URL`
- Redis (required if you want queues/workers and Bull Board)
- Optional:
  - Gmail SMTP credentials (`EMAIL` + `APP_PASS`) for Nodemailer
  - Twilio credentials for SMS OTP

## Quick Start

1. Install dependencies

```sh
npm install
```

2. Create your env file

```sh
cp .env.example .env
```

Minimum required env vars for local dev:

- `DATABASE_URL`
- `REDIS_HOST` / `REDIS_PORT` (required for queues/workers)
- `API_KEY`
- `API_ACCESS_TOKEN` (optional; if empty, it falls back to `API_KEY`)

3. Generate Prisma client

```sh
npm run pg
```

4. Run the server in development

```sh
npm run dev
```

The server prints the final URL on startup.

> Default port is `5000`.
> If that port is busy, the server automatically tries the next available port.

## Scripts

- `npm run dev` — Start the server with `tsx watch ./src/server.ts`
- `npm start` — Run the compiled server from `./dist/server.js`
- `npm run build` — Compile TypeScript and generate Prisma client
- `npm run pm` — Run Prisma migrate dev
- `npm run pg` — Generate Prisma client
- `npm run lint:check` — Run ESLint
- `npm run lint:fix` — Fix lint issues
- `npm run prettier:check` — Check formatting
- `npm run prettier:fix` — Format files

## Environment Variables

See `.env.example` for the full list.

### Core

- `NODE_ENV` — `development` | `production`
- `PORT` — server port (default `5000`)
- `FRONTEND_URL` — used for CORS allow-list in production
- `BACKEND_URL`, `BACKEND_IMAGE_URL`, `RESET_PASS_LINK` — optional URLs used for links/assets

### HTTP Middleware

- `MAX_BODY_SIZE` — request max body size in **bytes** (default: `1048576`)
- `REQUEST_TIMEOUT_MS` — request timeout in **ms** (default: `30000`)

### Database (Prisma + MongoDB)

- `DATABASE_URL` — MongoDB connection string (Prisma datasource)

### Redis (BullMQ)

Redis is used by BullMQ queues/workers and Bull Board.

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD` (optional)

### API Security Headers

Protected routes require both headers:

- `API_KEY` — required
- `API_ACCESS_TOKEN` — optional; if empty, the server validates `X-API-Access-Token` against `API_KEY`

### Email (optional)

The included workers use Nodemailer with Gmail service.

- `EMAIL` — Gmail address
- `APP_PASS` — Gmail app password

SendGrid helpers exist in code, but the current queue workers use the Nodemailer sender by default.

### Twilio SMS (optional)

Used when OTP jobs run with `type: "sms"`:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

## API Overview

Base URL:

- `http://localhost:5000/api/v1`

### Public endpoints

- `GET /status` — `{ status: 200, message: "API is running ✅" }`
- `GET /api/v1/` — `{ status: "ok" }`

### Protected endpoints

These routes are protected by middleware:

- `/api/v1/users/*`
- `/api/v1/admin/queues` (Bull Board UI)

## Request Headers

### `X-API-Key`

- Required on protected routes.
- Must match `API_KEY`.

### `X-API-Access-Token`

- Required on protected routes.
- Must match `API_ACCESS_TOKEN` (or `API_KEY` if `API_ACCESS_TOKEN` is empty).
- Accepts either raw token or `Bearer <token>`.

### `X-Request-Id`

- Optional.
- If provided, the server uses your value.
- If omitted, the server generates one.
- Always echoed back in the response as `X-Request-Id`.

### `X-Device-Id`

- Optional.
- Used by login endpoints to associate sessions when `deviceId` is not present in the JSON body.

## Auth Routes

Mounted at `/api/v1/auth`:

- `POST /register`
- `POST /register-without-otp`
- `POST /verify-email-otp`
- `POST /login`
- `POST /login-without-otp`
- `POST /forgot-password`
- `POST /reset-password`
- `GET /social-login/google`
- `GET /social-login/google/callback`
- `GET /social-login/facebook`
- `GET /social-login/facebook/callback`

### Login cookies

On login endpoints the server sets secure HttpOnly cookies:

- `accessToken`
- `refreshToken`
- `sessionId`

- `secure: true` only in production
- `sameSite: Lax`

## user Routes

Mounted at `/api/v1/users` (protected):

- `GET /all`
- `GET /:id`
- `PUT /:id`
- `DELETE /:id`
- `PATCH /:id/password`
- `PATCH /:id/email`

## Response Format

Successful responses generally follow:

```json
{
  "success": true,
  "message": "...",
  "meta": null,
  "data": {}
}
```

Errors (centralized handler) generally follow:

```json
{
  "success": false,
  "message": "...",
  "errorMessages": [{ "path": "...", "message": "..." }],
  "err": {},
  "stack": "..."
}
```

`stack` is only included when `NODE_ENV` is not `production`.

## Queues, Workers, and Bull Board

This backend initializes BullMQ queues and workers on server startup.

### Queues

- `otp-queue`
- `mail-queue`

Default job behavior:

- `attempts: 3` with exponential backoff
- Keeps the last `50` completed and `25` failed jobs

### Workers

- OTP worker processes `otp-queue` and sends OTP via email (default) or SMS (Twilio)
- Email worker processes `mail-queue` and sends invitation emails

### Queue cleanup

OTP queue cleanup runs periodically and removes older completed/failed/delayed jobs.

### Bull Board (Queues UI)

Bull Board is mounted at:

- `/api/v1/admin/queues`

It is also protected by `X-API-Key` + `X-API-Access-Token`.

Browser note: browsers can’t easily set custom headers from the address bar. Use Postman/Insomnia, or a reverse proxy that injects headers.

## Postman Collection

Import `postman.json` into Postman.

It includes:

- `baseUrl` (defaults to `http://localhost:5000/api/v1`)
- `apiKey`, `apiAccessToken`
- common auth + user requests

## Troubleshooting

- `EADDRINUSE` on startup: the server will automatically switch to another port; check the startup log for the final URL.
- Redis connection errors: queues/workers and Bull Board require Redis; set `REDIS_HOST`/`REDIS_PORT` correctly.
- Prisma connection errors: verify `DATABASE_URL` points to a reachable MongoDB instance.
- `413 Payload too large`: increase `MAX_BODY_SIZE`.
- Requests timing out: increase `REQUEST_TIMEOUT_MS`.
- CORS issues in production: set `FRONTEND_URL` to the exact origin (no path; trailing slash is OK).
