export const eventInviteEmail = (
  eventName: string,
  date: string,
  location: string,
  hostName: string,
  acceptLink: string = "http://localhost:3000/accept",
  declineLink: string = "http://localhost:3000/decline"
) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event Invitation</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f6f9fc; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: #0077ff; color: #fff; padding: 25px; text-align: center;">
      <h1 style="margin: 0; font-size: 22px;">You've been invited!</h1>
    </div>

    <!-- Content -->
    <div style="padding: 20px; text-align: center; color: #333;">
      <h2 style="margin: 10px 0; font-size: 24px;">${eventName}</h2>
      <p style="margin: 5px 0; font-size: 16px;">📅 ${date}</p>
      <p style="margin: 5px 0; font-size: 16px;">📍 ${location}</p>
      <p style="margin: 15px 0; font-size: 16px;">Hosted by <strong>${hostName}</strong></p>

      <p style="margin: 15px 0; font-size: 15px;">You've been invited to join this plan. Please RSVP below.</p>
      
      <!-- Buttons -->
      <div style="margin: 20px 0;">
        <a href="${declineLink}" style="text-decoration: none; padding: 12px 20px; border: 1px solid #0077ff; border-radius: 8px; margin-right: 10px; color: #0077ff; font-weight: bold;">Not Going</a>
        <a href="${acceptLink}" style="text-decoration: none; padding: 12px 20px; border-radius: 8px; background: #0077ff; color: #fff; font-weight: bold;">Accept</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f1f1f1; text-align: center; padding: 12px; font-size: 12px; color: #777;">
      <p style="margin: 4px 0;">Don’t have the app? Download now:</p>
      <div>
        <a href="#" style="margin: 0 6px; text-decoration: none; color: #0077ff;">Google Play</a> | 
        <a href="#" style="margin: 0 6px; text-decoration: none; color: #0077ff;">App Store</a>
      </div>
      <p style="margin: 10px 0;">Plandoon makes planning simple, fun, and stress-free.</p>
      <a href="#" style="color: #0077ff; text-decoration: none; font-size: 12px;">Contact Support</a> | 
      <a href="#" style="color: #0077ff; text-decoration: none; font-size: 12px;">Unsubscribe</a>
      <p style="margin: 8px 0; font-size: 11px; color: #999;">© ${new Date().getFullYear()} Plandoon</p>
    </div>
  </div>
</body>
</html>`;
};
