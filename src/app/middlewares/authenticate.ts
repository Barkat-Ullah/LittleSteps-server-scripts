import { Secret } from "jsonwebtoken";

import ApiError from "../../error/ApiErrors";
import { jwtHelpers } from "../../helpers/jwtHelpers";
import prisma from "../../shared/prisma";
import { config } from "../../config";

export const authenticate = async (
  token: string,
  userId: string,
): Promise<boolean> => {
  try {
    if (!token) {
      throw new ApiError(401, "Authentication token is required");
    }

    // Verify the JWT token
    const verifiedUser = jwtHelpers.verifyToken(
      token,
      config.jwt.jwt_secret as Secret,
    );

    // Check if user exists and token matches
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
        email: verifiedUser.email,
      },
    });

    if (!user) {
      throw new ApiError(404, "user not found");
    }

    // Verify that the stored token matches
    // if (user.accessToken !== token) {
    //   throw new ApiError(401, "Invalid or expired token");
    // }

    return true;
  } catch (error) {
    console.error("Authentication error:", error);
    return false;
  }
};
