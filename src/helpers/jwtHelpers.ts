import jwt from "jsonwebtoken";
import type { JwtPayload, Secret, SignOptions } from "jsonwebtoken";

const stripBearerPrefix = (token: string) => {
  const trimmed = token.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice("bearer ".length).trim();
  }
  return trimmed;
};

export const jwtHelpers = {
  createToken: <T extends object>(
    payload: T,
    secret: Secret,
    expiresIn?: string | number,
  ) => {
    const options: SignOptions = {};
    if (expiresIn !== undefined) {
      options.expiresIn = expiresIn as any;
    }
    return jwt.sign(payload, secret, options);
  },

  verifyToken: (token: string, secret: Secret) => {
    const raw = stripBearerPrefix(token);
    return jwt.verify(raw, secret) as JwtPayload & Record<string, unknown>;
  },
};
