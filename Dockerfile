FROM node:20-slim AS deps

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

# ─────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

EXPOSE 5000
ENV NODE_ENV=production

CMD ["npx", "tsx", "src/server.ts"]