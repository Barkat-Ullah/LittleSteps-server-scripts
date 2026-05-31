import { config as configure } from "dotenv";

export type HonoBindings = {
  NODE_ENV?: string;
  FRONTEND_URL?: string;
  BACKEND_URL?: string;
  BACKEND_IMAGE_URL?: string;
  DATABASE_URL?: string;

  PORT?: string;

  // HTTP / middleware
  MAX_BODY_SIZE?: string;
  REQUEST_TIMEOUT_MS?: string;

  // Auth
  API_KEY?: string;
  API_ACCESS_TOKEN?: string;
  JWT_SECRET?: string;
  EXPIRES_IN?: string;
  REFRESH_TOKEN_SECRET?: string;
  REFRESH_TOKEN_EXPIRES_IN?: string;
  RESET_PASS_TOKEN?: string;
  RESET_PASS_TOKEN_EXPIRES_IN?: string;
  RESET_PASS_LINK?: string;

  // Payments
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_CLIENT_ID?: string;
  PAYPEL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_MODE?: string;

  // Email
  EMAIL?: string;
  APP_PASS?: string;
  SENDGRID_API_KEY?: string;
  SENDGRID_EMAIL?: string;

  // S3
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_BUCKET?: string;
  S3_PUBLIC_BASE_URL?: string;

  // DigitalOcean Spaces compatibility
  DO_SPACE_ENDPOINT?: string;
  DO_SPACE_ACCESS_KEY?: string;
  DO_SPACE_SECRET_KEY?: string;
  DO_SPACE_BUCKET?: string;
  DO_SPACE_REGION?: string;
  DO_SPACE_CDN_ENDPOINT?: string;

  // Password
  PASSWORD_SALT?: string;

  // OAuth (Passport)
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
};

const hasProcessEnv =
  typeof process !== "undefined" &&
  typeof (process as any).env !== "undefined" &&
  (process as any).env !== null;

// Load .env only for Node/Bun-like runtimes.
if (hasProcessEnv) {
  configure();
}

const numberFromEnv = (value: unknown, fallback: number) => {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const createConfig = (env: HonoBindings = {}) => {
  const resolvedEnv =
    env.NODE_ENV ?? (hasProcessEnv ? process.env.NODE_ENV : undefined);
  const merged: HonoBindings = {
    ...(hasProcessEnv ? (process.env as any) : {}),
    ...env,
  };

  return {
    env: resolvedEnv,
    db_url: merged.DATABASE_URL,
    frontend_url: merged.FRONTEND_URL,
    stripe_secret_key: merged.STRIPE_SECRET_KEY,
    stripe_publishable_key: merged.STRIPE_PUBLISHABLE_KEY,
    stripe_client_id: merged.STRIPE_CLIENT_ID,
    port: merged.PORT || 5000,
    http: {
      max_body_size: numberFromEnv(merged.MAX_BODY_SIZE, 1024 * 1024),
      request_timeout_ms: numberFromEnv(merged.REQUEST_TIMEOUT_MS, 30_000),
    },
    jwt: {
      api_key: merged.API_KEY,
      // Keep backward compatibility with existing deployments that only set API_KEY.
      // If API_ACCESS_TOKEN is not provided, X-API-Access-Token will validate against API_KEY.
      api_access_token: merged.API_ACCESS_TOKEN ?? merged.API_KEY,
      jwt_secret: merged.JWT_SECRET,
      expires_in: merged.EXPIRES_IN,
      refresh_token_secret: merged.REFRESH_TOKEN_SECRET,
      refresh_token_expires_in: merged.REFRESH_TOKEN_EXPIRES_IN,
      reset_pass_secret: merged.RESET_PASS_TOKEN,
      reset_pass_token_expires_in: merged.RESET_PASS_TOKEN_EXPIRES_IN,
    },
    reset_pass_link: merged.RESET_PASS_LINK,
    emailSender: {
      email: merged.EMAIL,
      app_pass: merged.APP_PASS,
    },
    paypal: {
      client_id: merged.PAYPEL_CLIENT_ID,
      client_secret: merged.PAYPAL_CLIENT_SECRET,
      mode: merged.PAYPAL_MODE,
    },
    sendGrid: {
      api_key: merged.SENDGRID_API_KEY,
      email_from: merged.SENDGRID_EMAIL,
    },
    s3: {
      endpoint: merged.S3_ENDPOINT ?? merged.DO_SPACE_ENDPOINT,
      access_key: merged.S3_ACCESS_KEY ?? merged.DO_SPACE_ACCESS_KEY,
      secret_key: merged.S3_SECRET_KEY ?? merged.DO_SPACE_SECRET_KEY,
      bucket: merged.S3_BUCKET ?? merged.DO_SPACE_BUCKET,
      public_base_url:
        merged.S3_PUBLIC_BASE_URL ??
        merged.DO_SPACE_CDN_ENDPOINT ??
        merged.DO_SPACE_ENDPOINT,
    },
    password: {
      password_salt: merged.PASSWORD_SALT,
    },
    url: {
      frontend_url: merged.FRONTEND_URL,
      backend_url: merged.BACKEND_URL,
      image_url: merged.BACKEND_IMAGE_URL,
      database_url: merged.DATABASE_URL,
    },
    google: {
      client_id: merged.GOOGLE_CLIENT_ID,
      client_secret: merged.GOOGLE_CLIENT_SECRET,
    },
    facebook: {
      app_id: merged.FACEBOOK_APP_ID,
      app_secret: merged.FACEBOOK_APP_SECRET,
    },
  };
};

export type AppConfig = ReturnType<typeof createConfig>;

// Default config for Bun/Node runtime.
export const config: AppConfig = createConfig();
