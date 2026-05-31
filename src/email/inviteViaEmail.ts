export type InviteViaEmailProps = {
  studentName: string;
  schoolName: string;
  className: string;
  studentEmail: string;
  joinLink: string;
};
export const inviteStudentEmail = (information: InviteViaEmailProps) => {
  const { studentName, schoolName, className, studentEmail, joinLink } =
    information;
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Class Invitation</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f6f9fc; margin: 0; padding: 0; line-height: 1.6;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
        
        <!-- Header -->
        <div style="background-color: #2196F3; background-image: linear-gradient(135deg, #2196F3, #1976D2); padding: 30px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);">Welcome to Your Class!</h1>
        </div>

        <!-- Body -->
        <div style="padding: 40px 30px; text-align: center;">
            <p style="font-size: 18px; color: #333333; margin-bottom: 10px;">Dear <strong>${studentName}</strong>,</p>
            <p style="font-size: 16px; color: #555555; margin-bottom: 30px;">
                You have been invited to join your class. Click the button below to get started!
            </p>

            <!-- Class Details Box -->
            <div style="background-color: #f9f9f9; padding: 25px; margin: 30px 0; border-left: 4px solid #2196F3; border-radius: 8px; text-align: left;">
                <h2 style="margin-top: 0; color: #2196F3; font-size: 20px; margin-bottom: 15px;">Your Class Details:</h2>
                <p style="margin: 10px 0; font-size: 16px; color: #333333;"><strong>School:</strong> ${schoolName}</p>
                <p style="margin: 10px 0; font-size: 16px; color: #333333;"><strong>Class:</strong> ${className}</p>
                <p style="margin: 10px 0; font-size: 16px; color: #333333;"><strong>Student Email:</strong> ${studentEmail}</p>
            </div>

            <!-- Call to Action Button -->
            <a href="${joinLink}" style="display: inline-block; font-size: 18px; font-weight: 600; color: #ffffff; background-color: #2196F3; background-image: linear-gradient(135deg, #2196F3, #1976D2); text-decoration: none; padding: 15px 40px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);">
                Join Class Now
            </a>

            <p style="font-size: 14px; color: #888888; margin-top: 20px;">
                If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="font-size: 14px; color: #2196F3; word-break: break-all; margin-top: 5px;">
                ${joinLink}
            </p>

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                <p style="font-size: 14px; color: #888888; margin-bottom: 4px;">If you have any questions, please contact your teacher or school administrator.</p>
                <p style="font-size: 14px; color: #888888; margin-bottom: 0;">If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999999;">
            <p style="margin: 0;">© ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
        </div>
        
    </div>
</body>
</html>`;
};
