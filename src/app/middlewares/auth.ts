import type { RequestHandler } from "express";
import type { Secret } from "jsonwebtoken";
import ApiError from "../../error/ApiErrors";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import { getEffectiveAccessId } from "../../helpers/careGiverAccessor";
import prisma from "../../shared/prisma";
import { config } from "../../config";
import redis, {
  cacheOr,
  TTL,
  isTokenBlacklisted,
} from "../../lib/redisConnection";

const auth = (...roles: string[]): RequestHandler => {
  return async (req, _res, next) => {
    try {
      const token =
        req.get("authorization") || (req as any).cookies?.accessToken;
      if (!token) throw new ApiError(401, "Unauthorized");

      const rawToken = token.replace(/^bearer /i, "").trim();

      // ✅ Blacklist check
      const blacklisted = await isTokenBlacklisted(rawToken);
      if (blacklisted) throw new ApiError(401, "Token has been invalidated");

      const verifiedUser = jwtHelpers.verifyToken(
        rawToken,
        config.jwt.jwt_secret as Secret,
      );

      // ✅ User cache check
      const user = await cacheOr(`user:${verifiedUser.id}`, TTL.SHORT, () =>
        prisma.user.findUnique({
          where: { id: verifiedUser.id },
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            isDeleted: true,
            createdById: true,
          },
        }),
      );

      if (!user) throw new ApiError(404, "User not found");
      if (user.isDeleted) throw new ApiError(404, "User not found");
      if (user.status === "SUSPENDED")
        throw new ApiError(403, "Your account has been suspended");

      if (verifiedUser.sessionId) {
        const isSessionCached = await redis.get(
          `session:${verifiedUser.sessionId}`,
        );

        if (!isSessionCached) {
          const session = await prisma.userSession.findUnique({
            where: { id: verifiedUser.sessionId },
          });

          if (!session || session.revokedAt !== null) {
            throw new ApiError(401, "Session expired, please login again");
          }
          await redis.setex(
            `session:${verifiedUser.sessionId}`,
            TTL.SHORT,
            "valid",
          );
        }
      }

      if (roles.length && !roles.includes(user.role)) {
        throw new ApiError(403, "Forbidden");
      }

      // Compute the effective access ID once (cached via cacheOr above)
      // For CAREGIVERs this resolves to their creator's ID; for others it's their own ID.
      (req as any).accessId = getEffectiveAccessId(user);
      (req as any).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
};

export default auth;

// const auth = (...roles: string[]): RequestHandler => {
//   return async (req, _res, next) => {
//     try {
//       const token =
//         req.get("authorization") ||
//         (req.headers.authorization as string | undefined);

//       if (!token) {
//         throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized!");
//       }

//       const verifiedUser = jwtHelpers.verifyToken(
//         token,
//         config.jwt.jwt_secret as Secret,
//       );

//       const user = await prisma.user.findUnique({
//         where: {
//           email: verifiedUser.email,
//         },
//       });

//       if (!user) {
//         throw new ApiError(httpStatus.NOT_FOUND, "This user is not found !");
//       }

//       if (roles.length && !roles.includes(verifiedUser.role)) {
//         throw new ApiError(httpStatus.FORBIDDEN, "Forbidden!");
//       }

//       (req as any).user = verifiedUser;

//       next();
//     } catch (err) {
//       next(err);
//     }
//   };
// };
