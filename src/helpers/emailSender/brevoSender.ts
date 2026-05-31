import * as nodemailer from "nodemailer";
const brevoMailSender = async (to: string, html: string, subject: string) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 2525,
      secure: false,
      auth: {
        user: process.env.BREVO_MAIL!,
        pass: process.env.BREVO_MAIL_PASS!,
      },
    });
    const mailOptions = {
      from: "<akonhasan680@gmail.com>",
      to,
      subject,
      text: html.replace(/<[^>]+>/g, ""),
      html,
    };
    // Send the email
    const info = await transporter.sendMail(mailOptions);
    return info.messageId;
  } catch (error) {
    throw new Error("Failed to send email. Please try again later.");
  }
};
export default brevoMailSender;
