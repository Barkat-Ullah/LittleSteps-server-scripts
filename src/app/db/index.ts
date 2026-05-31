
import { userRole } from "@prisma/client";
import prisma from "../../shared/prisma";
import bcrypt from "bcryptjs";

export const initiateAdmin = async () => {
  const payload = {
    userName: "admin",
    firstName: "Admin",
    lastName: "User",
    email: "admin@example.com",
    password: "123456",
    role: "ADMIN",
  };

  const existingAdmin = await prisma.user.findUnique({
    where: { email: payload.email },
  });

  if (existingAdmin) {
    return;
  }

  await prisma.$transaction(async (TransactionClient) => {
    const hashedPassword: string = await bcrypt.hash(payload.password, 12);
    await TransactionClient.user.create({
      data: {
        userDetails: {
          create: {
            // userName: payload.userName,
            firstName: payload.firstName,
            lastName: payload.lastName,
          },
        },
        email: payload.email,
        password: hashedPassword,
        role: payload.role as userRole,
      },
    });
  });
};
