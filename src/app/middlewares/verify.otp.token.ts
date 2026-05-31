import type { RequestHandler } from "express";
import type { Secret } from "jsonwebtoken";
import httpStatus from "http-status";
import ApiError from "../../error/ApiErrors";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import { config } from "../../config";
import prisma from "../../shared/prisma";

const validateOtpMiddleware = (...roles: string[]): RequestHandler => {
  return async (req, _res, next) => {
    try {
      const token =
        req.get("authorization") ||
        (req.headers.authorization as string | undefined);
      if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, "You are not authorized!");
      }
      const verifieduser = jwtHelpers.verifyToken(
        token,
        config.jwt.jwt_secret as Secret,
      );

      if (verifieduser.otpType === "EMAIL_VERIFICATION") {
        (req as any).user = verifieduser;
        next();
        return;
      }

      const existinguser = await prisma.user.findUnique({
        where: { id: verifieduser.id },
      });

      if (!existinguser) {
        throw new ApiError(404, "user Not Found");
      }

      (req as any).user = verifieduser;

      if (roles.length && !roles.includes(verifieduser.role)) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "Forbidden! You are not authorized",
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

export default validateOtpMiddleware;
