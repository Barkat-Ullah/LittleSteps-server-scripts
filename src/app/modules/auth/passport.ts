import passport from "passport";
import type { Request, Response, NextFunction } from "express";
import httpStatus from "http-status";
import {
  Strategy as GoogleStrategy,
  type Profile as GoogleProfile,
} from "passport-google-oauth20";
import {
  Strategy as FacebookStrategy,
  type Profile as FacebookProfile,
} from "passport-facebook";

import { config } from "../../../config";
import ApiError from "../../../error/ApiErrors";
import prisma from "../../../shared/prisma";
import { userRole } from "@prisma/client";
import { issueTokensAndSession } from "./auth.service";
import { setAuthCookies } from "./auth.cookies";

type Minimaluser = { id: string; email: string; role: userRole };

const normalizeEmail = (email: string) => email.trim().toLowerCase();

let configured = false;

const requireEnv = (name: string, value?: string) => {
  if (!value) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Server misconfigured: ${name} is not set`,
    );
  }
  return value;
};

const resolveCallbackUrl = (path: string) => {
  const base = config.url.backend_url?.trim().replace(/\/+$/, "");
  if (base) return `${base}${path}`;
  return path;
};

const profileEmail = (profile: {
  emails?: Array<{ value?: string | null }>;
}) => {
  const value = profile.emails?.[0]?.value;
  return value ? normalizeEmail(value) : null;
};

const upsertOAuthuser = async (params: {
  provider: "GOOGLE" | "FACEBOOK";
  provideruserId: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) => {
  const { provider, provideruserId, email, firstName, lastName } = params;

  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: {
      provider_provideruserId: {
        provider,
        provideruserId,
      },
    },
  });

  if (existingOAuth) {
    const auth = await prisma.user.findUnique({
      where: { id: existingOAuth.userId },
    });
    if (!auth) {
      throw new ApiError(httpStatus.NOT_FOUND, "Linked user not found");
    }
    return {
      id: auth.id,
      email: auth.email,
      role: auth.role,
    } satisfies Minimaluser;
  }

  if (!email) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Social provider did not return an email address",
    );
  }

  // If a user exists with the same email, link it; else create.
  let auth = await prisma.user.findUnique({ where: { email } });
  if (!auth) {
    auth = await prisma.user.create({
      data: {
        email,
        password: null,
        role: userRole.USER,
        provider,
      },
    });

    await prisma.userDetails.create({
      data: {
        userId: auth.id,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: {
      userId: auth.id,
      provider,
      provideruserId,
    },
  });

  return {
    id: auth.id,
    email: auth.email,
    role: auth.role,
  } satisfies Minimaluser;
};

export const ensurePassportConfigured = () => {
  if (configured) return;

  const googleClientId = config.google?.client_id;
  const googleClientSecret = config.google?.client_secret;
  const facebookAppId = config.facebook?.app_id;
  const facebookAppSecret = config.facebook?.app_secret;

  if (googleClientId && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientId,
          clientSecret: googleClientSecret,
          callbackURL: resolveCallbackUrl(
            "/api/v1/auth/social-login/google/callback",
          ),
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done,
        ) => {
          try {
            const email = profileEmail(profile);
            const user = await upsertOAuthuser({
              provider: "GOOGLE",
              provideruserId: profile.id,
              email,
              firstName: profile.name?.givenName ?? null,
              lastName: profile.name?.familyName ?? null,
            });
            done(null, user);
          } catch (err) {
            done(err as any);
          }
        },
      ),
    );
  }

  if (facebookAppId && facebookAppSecret) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: facebookAppId,
          clientSecret: facebookAppSecret,
          callbackURL: resolveCallbackUrl(
            "/api/v1/auth/social-login/facebook/callback",
          ),
          profileFields: ["id", "emails", "name"],
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: FacebookProfile,
          done,
        ) => {
          try {
            const email = profileEmail(profile);
            const user = await upsertOAuthuser({
              provider: "FACEBOOK",
              provideruserId: profile.id,
              email,
              firstName: (profile as any).name?.givenName ?? null,
              lastName: (profile as any).name?.familyName ?? null,
            });
            done(null, user);
          } catch (err) {
            done(err as any);
          }
        },
      ),
    );
  }

  // No sessions in this API.
  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((obj: any, done) => done(null, obj));

  configured = true;
};

// ── Google ────────────────────────────────────────────────────────────────────

export const googleAuthRedirect = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  requireEnv("GOOGLE_CLIENT_ID", config.google?.client_id);
  requireEnv("GOOGLE_CLIENT_SECRET", config.google?.client_secret);
  ensurePassportConfigured();

  passport.authenticate("google", {
    session: false,
    scope: ["profile", "email"],
  })(req, res, next);
};

export const googleAuthCallback = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  ensurePassportConfigured();

  passport.authenticate(
    "google",
    { session: false },
    async (err: any, user: Minimaluser | false) => {
      if (err) return next(err);
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Social login failed" });
      }

      try {
        const deviceId = req.headers["x-device-id"] as string | undefined;
        const userAgent = req.headers["user-agent"];
        const ipAddress = req.headers["x-forwarded-for"] as string | undefined;

        const tokens = await issueTokensAndSession(
          { id: user.id, email: user.email, role: user.role },
          {
            deviceId:
              deviceId?.trim() ||
              globalThis.crypto?.randomUUID?.() ||
              `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            userAgent,
            ipAddress,
          },
        );

        setAuthCookies(res, tokens);

        return res.status(200).json({
          success: true,
          message: "Social login successful",
          data: { user, ...tokens },
        });
      } catch (e) {
        return next(e);
      }
    },
  )(req, res, next);
};

// ── Facebook ──────────────────────────────────────────────────────────────────

export const facebookAuthRedirect = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  requireEnv("FACEBOOK_APP_ID", config.facebook?.app_id);
  requireEnv("FACEBOOK_APP_SECRET", config.facebook?.app_secret);
  ensurePassportConfigured();

  passport.authenticate("facebook", {
    session: false,
    scope: ["email"],
  })(req, res, next);
};

export const facebookAuthCallback = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  ensurePassportConfigured();

  passport.authenticate(
    "facebook",
    { session: false },
    async (err: any, user: Minimaluser | false) => {
      if (err) return next(err);
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Social login failed" });
      }

      try {
        const deviceId = req.headers["x-device-id"] as string | undefined;
        const userAgent = req.headers["user-agent"];
        const ipAddress = req.headers["x-forwarded-for"] as string | undefined;

        const tokens = await issueTokensAndSession(
          { id: user.id, email: user.email, role: user.role },
          {
            deviceId:
              deviceId?.trim() ||
              globalThis.crypto?.randomUUID?.() ||
              `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            userAgent,
            ipAddress,
          },
        );

        setAuthCookies(res, tokens);

        return res.status(200).json({
          success: true,
          message: "Social login successful",
          data: { user, ...tokens },
        });
      } catch (e) {
        return next(e);
      }
    },
  )(req, res, next);
};
