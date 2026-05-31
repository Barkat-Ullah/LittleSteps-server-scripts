import { Job, Worker } from "bullmq";
import { inviteStudentEmail } from "../../email/inviteViaEmail";
import emailSender from "../emailSender/emailSender";
import { createWorker } from "./workerFactory";

export const emailWorker: Worker = createWorker(
  "mail-queue",
  async (job: Job) => {
    const { information, type = "email" } = job.data;

    const otpHtml = inviteStudentEmail(information);
    await emailSender(
      `You're Invited to Join ${information.className} at ${information.schoolName}`,
      information.studentEmail,
      otpHtml
    );
    console.log(`✅ Class invitation sent to ${information.studentEmail}`);

    return { success: true, type, identifier: information.studentEmail };
  }
);
