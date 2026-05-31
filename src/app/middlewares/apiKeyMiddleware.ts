import type { Request, Response, NextFunction } from "express";
import httpStatus from "http-status";

import ApiError from "../../error/ApiErrors";
import { config } from "../../config";

export const apiKeyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const apiKey = req.get("x-api-key");

    if (!apiKey) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "API key is required");
    }

    const isValidKey = apiKey === config.jwt.api_key;
    if (!isValidKey) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Invalid or inactive API key",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
