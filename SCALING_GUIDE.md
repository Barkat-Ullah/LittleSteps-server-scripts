# High-Scale Application Architecture Guide (50K+ Users)

## Table of Contents

1. [Overview](#overview)
2. [Request Flow Architecture](#request-flow-architecture)
3. [PM2 + Nginx Setup](#pm2--nginx-setup)
4. [Redis for Caching & Sessions](#redis-for-caching--sessions)
5. [Database Optimization](#database-optimization)
6. [Rate Limiting & Request Control](#rate-limiting--request-control)
7. [Load Balancing Strategies](#load-balancing-strategies)
8. [Monitoring & Logging](#monitoring--logging)
9. [Security at Scale](#security-at-scale)
10. [Real-World Industry Practices](#real-world-industry-practices)

---

## Overview

When scaling to 50K+ concurrent users, a single Node.js process cannot handle all requests efficiently. The solution involves:

- **Horizontal Scaling**: Multiple app instances (PM2)
- **Load Balancing**: Distribute requests (Nginx)
- **Caching Layer**: Reduce database hits (Redis)
- **Request Control**: Rate limiting, throttling
- **Database Optimization**: Indexes, connection pooling
- **Monitoring**: Track performance, identify bottlenecks

---

## Request Flow Architecture

```
User Requests
    ↓
[Nginx Reverse Proxy + Load Balancer]
    ↓
[PM2 Cluster Mode - Multiple Node.js Processes]
    ├── Instance 1
    ├── Instance 2
    ├── Instance 3
    └── Instance 4
    ↓
[Redis Cache Layer]
    ↓
[Database Connection Pool]
    ↓
[MongoDB/PostgreSQL]
```

---

## PM2 + Nginx Setup

### 1. PM2 Ecosystem Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "advance-backend",
      script: "./dist/server.js",
      instances: "max", // Use all CPU cores
      exec_mode: "cluster", // Cluster mode for load balancing
      max_memory_restart: "1G", // Restart if exceeds 1GB
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      watch: false, // Set true for dev, false for prod
      ignore_watch: ["node_modules", "logs", "dist"],
      max_restarts: 10,
      min_uptime: "10s",
      autorestart: true,
    },
  ],
};
```

### 2. Start with PM2

```bash
# Build the app
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# View logs
pm2 logs advance-backend

# Save PM2 config to auto-start on reboot
pm2 save
pm2 startup
```

### 3. Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/advance-backend`:

```nginx
upstream backend {
    # Load balance across PM2 instances
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;

    # Health check
    keepalive 32;
}

server {
    listen 80;
    server_name api.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Gzip Compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1000;
    gzip_comp_level 6;

    # Request/Response buffers
    client_body_buffer_size 128k;
    client_max_body_size 100M;
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;

    # Timeouts
    client_body_timeout 60s;
    client_header_timeout 60s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Rate limiting (1000 requests per second per IP)
    limit_req_zone $binary_remote_addr zone=general:10m rate=1000r/s;
    limit_req zone=general burst=5000 nodelay;

    # Proxy configuration
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off; // For WebSocket support
    }

    # Health check endpoint
    location /health {
        proxy_pass http://backend;
        access_log off;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/advance-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Redis for Caching & Sessions

### 1. Redis Setup

```bash
# Install Redis
sudo apt-get install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Check status
redis-cli ping  # Should return PONG
```

### 2. Session Management with Redis

Update `src/config/index.ts`:

```typescript
import { createClient } from "redis";

const redisClient = createClient({
  host: config.redis.host || "localhost",
  port: config.redis.port || 6379,
  password: config.redis.password,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

redisClient.on("error", (err) => console.error("Redis error:", err));

export const redis = redisClient;
```

### 3. Caching Strategy

```typescript
// Cache common queries
const getCachedUser = async (userId: string) => {
  const cacheKey = `user:${userId}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Fetch from DB
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  // Store in cache (5 minutes)
  if (user) {
    await redis.setEx(cacheKey, 300, JSON.stringify(user));
  }

  return user;
};

// Invalidate cache on update
const updateUser = async (userId: string, data: any) => {
  const result = await prisma.user.update({
    where: { id: userId },
    data,
  });

  // Clear cache
  await redis.del(`user:${userId}`);

  return result;
};
```

### 4. Redis for OTP/Session Storage

```typescript
// Store temporary OTP (2 minutes expiry)
await redis.setEx(
  `otp:email:${email}`,
  120,
  JSON.stringify({ otpHash, createdAt: new Date() }),
);

// Store user sessions
await redis.setEx(
  `session:${sessionId}`,
  86400, // 24 hours
  JSON.stringify({ userId, tokens }),
);
```

---

## Database Optimization

### 1. Connection Pooling

```typescript
// prisma/schema.prisma
datasource db {
  provider = "mongodb" // or postgresql
  url      = env("DATABASE_URL")
  // Enable connection pooling (if using PostgreSQL)
  // shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
}

// For PostgreSQL, use pgBouncer
// Configuration: /etc/pgbouncer/pgbouncer.ini
[databases]
mydb = host=localhost port=5432 dbname=mydb user=postgres password=secret

[pgbouncer]
pool_mode = transaction  // Reduce per-connection overhead
max_client_conn = 10000
default_pool_size = 25
min_pool_size = 10
```

### 2. Database Indexes

```prisma
model User {
  id     String  @id @default(auto()) @map("_id") @db.ObjectId
  email  String  @unique
  status String  @default("ACTIVE")

  // Add indexes for frequently queried fields
  @@index([email])
  @@index([status])
  @@index([createdAt])
}

model userSession {
  id      String  @id @default(auto()) @map("_id") @db.ObjectId
  userId  String  @db.ObjectId

  // Composite index for faster lookups
  @@index([userId])
  @@index([createdAt])
  @@index([userId, revokedAt])
}
```

### 3. Query Optimization

```typescript
// Bad: N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  const sessions = await prisma.userSession.findMany({
    where: { userId: user.id },
  });
}

// Good: Use relation
const users = await prisma.user.findMany({
  include: {
    sessions: true,
  },
});

// Good: Select only needed fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    role: true,
  },
});
```

---

## Rate Limiting & Request Control

### 1. Nginx Rate Limiting (Already in config above)

### 2. Application-Level Rate Limiting

```typescript
import rateLimit from "express-rate-limit";

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.role === "ADMIN", // Skip for admins
  keyGenerator: (req) => req.ip || req.socket.remoteAddress,
});

// Strict login limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Apply limiters
app.use("/api/", apiLimiter);
app.post("/auth/login", loginLimiter, loginController);
```

### 3. Redis-Based Rate Limiting

```typescript
import { RedisStore } from "rate-limit-redis";

const redisStore = new RedisStore({
  client: redis,
  prefix: "rl:", // Rate limit prefix
});

const apiLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000,
  max: 100,
});
```

---

## Load Balancing Strategies

### 1. Round Robin (Default in Nginx)

- Distribute requests equally across servers
- Best for uniform request processing time

### 2. Least Connections

```nginx
upstream backend {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}
```

### 3. IP Hash (Sticky Sessions)

```nginx
upstream backend {
    ip_hash;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}
```

### 4. Weighted Load Balancing

```nginx
upstream backend {
    server 127.0.0.1:3000 weight=5; // High-spec server
    server 127.0.0.1:3001 weight=2; // Lower-spec server
}
```

---

## Monitoring & Logging

### 1. PM2 Monitoring

```bash
# Built-in monitoring
pm2 monit

# Web-based dashboard
pm2 web  # Access at http://localhost:9615

# Advanced monitoring with PM2+
pm2 install pm2-logrotate  # Automatic log rotation
pm2 install pm2-auto-pull  # Auto git pull
```

### 2. Application Logging

```typescript
// src/utils/logger.ts
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({ filename: "logs/combined.log" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Use in app
logger.info("User login", { userId, email });
logger.error("Database error", { error });
```

### 3. Performance Monitoring

```bash
# Monitor CPU, Memory, Disk
sudo apt-get install htop
htop

# Monitor Nginx
sudo systemctl status nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Monitor Redis
redis-cli
> info memory
> info stats
> dbsize
```

### 4. APM (Application Performance Monitoring)

```typescript
// New Relic, DataDog, or similar
import newrelic from "newrelic";

app.get("/api/users", (req, res) => {
  // Automatically tracked
});
```

---

## Security at Scale

### 1. Environment Variables Management

```bash
# Use .env.production
NODE_ENV=production
DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net/db
REDIS_URL=redis://:password@redis-server:6379
JWT_SECRET=long-random-secret-key
```

### 2. CORS & CSRF Protection

```typescript
import cors from "cors";
import helmet from "helmet";
import csrf from "csrf";

app.use(helmet()); // Secure HTTP headers
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

// CSRF protection
app.use(csrf());
```

### 3. Input Validation

```typescript
// Already using Zod in your app
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const validated = schema.parse(req.body);
```

### 4. API Key & JWT Validation

```typescript
// API Key middleware
const apiKeyMiddleware = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !validKeys.includes(apiKey)) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
};

// JWT validation (already in your app)
app.use(auth(userRole.USER));
```

---

## Real-World Industry Practices

### 1. Netflix Architecture

- **Microservices**: Separate services for different features
- **CDN**: CloudFront for global distribution
- **Caching**: Multi-layer caching (browser, edge, Redis, database)
- **Database**: Sharding and replication

### 2. Facebook/Meta Scale

- **Distributed Database**: Sharding by user ID
- **Message Queue**: Kafka for async processing
- **CDN**: Edge servers worldwide
- **Multi-Region**: Active-active deployments

### 3. AWS Recommendations

```
├── EC2 Auto Scaling Group (behind ALB)
├── ElastiCache (Redis)
├── RDS (with read replicas)
├── S3 + CloudFront (static assets)
├── Lambda for background jobs
└── CloudWatch for monitoring
```

### 4. General Best Practices

1. **Stateless Services**: Don't store state in process memory
2. **Asynchronous Processing**: Use job queues (BullMQ in your app)
3. **Database Replication**: Read replicas for analytics
4. **Horizontal Scaling**: Add servers, not bigger servers
5. **Graceful Degradation**: Core features work when some services fail
6. **Circuit Breaker Pattern**: Prevent cascading failures
7. **Health Checks**: Automated recovery
8. **Monitoring & Alerting**: Know when issues occur

---

## Deployment Checklist for 50K+ Users

```
✓ PM2 cluster mode configured with auto-restart
✓ Nginx reverse proxy with SSL/TLS
✓ Redis for caching and sessions
✓ Database connection pooling
✓ Database indexes on frequently queried fields
✓ Rate limiting (both Nginx and app-level)
✓ CORS and CSRF protection
✓ Comprehensive logging
✓ Monitoring setup (PM2, Nginx, Redis, App)
✓ Automated backups
✓ Graceful shutdown handling
✓ Environment variables secured
✓ Load testing completed
✓ Disaster recovery plan
✓ Documentation updated
```

---

## Quick Start Command Reference

```bash
# Build and deploy
npm run build
pm2 start ecosystem.config.js

# Monitor
pm2 monit
pm2 logs advance-backend

# Restart gracefully
pm2 gracefulReload all

# View status
pm2 status

# Stop all
pm2 stop all

# Delete from PM2
pm2 delete all

# Clear PM2 logs
pm2 flush

# Nginx reload
sudo nginx -s reload

# Redis CLI
redis-cli
> DBSIZE
> FLUSHDB
```

---

## Further Resources

- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Documentation](https://nginx.org/en/)
- [Redis Documentation](https://redis.io/documentation)
- [Node.js Clustering](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Docker for containerization](https://www.docker.com/)
- [Kubernetes for orchestration](https://kubernetes.io/)

---

**Last Updated**: May 2026  
**Target Scale**: 50,000+ concurrent users
