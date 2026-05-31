import bcrypt from "bcryptjs";
import { config } from "../config";

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = Number(config.password.password_salt || 12);

  const bunPassword = (globalThis as any)?.Bun?.password;
  if (bunPassword?.hash) {
    return await bunPassword.hash(password, {
      algorithm: "bcrypt",
      cost: saltRounds,
    });
  }

  return await bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  const bunPassword = (globalThis as any)?.Bun?.password;
  if (bunPassword?.verify) {
    return await bunPassword.verify(password, hashedPassword);
  }

  return await bcrypt.compare(password, hashedPassword);
};
