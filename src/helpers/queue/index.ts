import { createQueue } from "./queueFactory";

export const otpQueue = createQueue("otp-queue");

export const mailQueue = createQueue("mail-queue");
