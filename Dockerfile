# ─────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Use npm ci if package-lock.json exists, otherwise npm install
RUN npm ci 2>/dev/null || npm install

COPY . .
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Deps only (no devDeps)
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ─────────────────────────────────────────────
# Stage 3: Production (distroless — near-zero CVEs)
# ─────────────────────────────────────────────
FROM gcr.io/distroless/nodejs20-debian12 AS production

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy prisma schema + generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 5000

ENV NODE_ENV=production

# distroless has no shell — node is the entrypoint, pass script directly
CMD ["dist/server.js"]