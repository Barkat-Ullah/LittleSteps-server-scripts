import { config } from "dotenv";
import twilio from "twilio";

config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendSmsOtp = async (phoneNumber: string, otpCode: string) => {
  console.log("SID:", process.env.TWILIO_ACCOUNT_SID);
  console.log("TOKEN:", process.env.TWILIO_AUTH_TOKEN);
  console.log("PHONE:", process.env.TWILIO_PHONE_NUMBER);

  try {
    const formattedPhone = phoneNumber.startsWith("+")
      ? phoneNumber
      : phoneNumber.startsWith("0")
      ? "+880" + phoneNumber.slice(1)
      : "+880" + phoneNumber;

    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!fromNumber)
      throw new Error("TWILIO_PHONE_NUMBER is not defined in env");

    const message = await client.messages.create({
      body: `Your OTP code is: ${otpCode}`,
      from: fromNumber,
      to: formattedPhone,
    });

    console.log("OTP sent via Twilio SMS:", message.sid);
    return message.sid;
  } catch (error) {
    console.error("Twilio SMS error:", error);
    throw new Error("Failed to send OTP via SMS");
  }
};
