import type { Request, Response, NextFunction } from "express";
import httpStatus from "http-status";

import ApiError from "../../error/ApiErrors";
import { config } from "../../config";

export const apiAccessTokenMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const expected = config.jwt.api_access_token;
    if (!expected) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Server misconfigured: API_ACCESS_TOKEN is not set",
      );
    }

    const raw = req.get("x-api-access-token");
    if (!raw) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "API access token is required",
      );
    }

    const token = raw.toLowerCase().startsWith("bearer ")
      ? raw.slice("bearer ".length).trim()
      : raw.trim();

    if (token !== expected) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid API access token");
    }

    next();
  } catch (error) {
    next(error);
  }
};
