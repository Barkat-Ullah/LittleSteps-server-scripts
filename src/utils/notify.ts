import ApiError from "../error/ApiErrors";
// import admin from "firebase-admin";
import { NotifyType } from '@prisma/client';
import prisma from "../shared/prisma";

interface CreateNotificationParams {
  receiverId: string;
  senderId: string | null;
  title: string;
  body: string;
  referenceId: string | null;
  type: NotifyType;
}

// Send push notification
export const sendPushNotification = async (
  fcmToken: string,
  title: string,
  body: string,
) => {
  if (!fcmToken) return;

  try {
    //* install firebase package
    // await admin.messaging().send({
    //   token: fcmToken,
    //   notification: { title, body },
    // });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    if (error.code === "messaging/invalid-registration-token") {
      throw new ApiError(400, "Invalid FCM registration token");
    } else if (error.code === "messaging/registration-token-not-registered") {
      throw new ApiError(404, "FCM token is no longer registered");
    } else {
      throw new ApiError(500, error.message || "Failed to send notification");
    }
  }
};

export const createNotification = async (params: CreateNotificationParams) => {
  const { receiverId, senderId, title, body, referenceId, type } = params;

  const notification = await prisma.notification.create({
    data: {
      receiverId,
      senderId,
      title,
      body,
      referenceId,
      type,
      isRead: false,
    },
    include: {
      sender: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });

  // Send push notification using receiver's FCM token
  // if (notification.receiver?.fcmToken) {
  //   await sendPushNotification(notification.receiver.fcmToken, title, body);
  // }

  return notification;
};

export const createBulkNotifications = async (
  notifications: CreateNotificationParams[],
) => {
  const result = await prisma.notification.createMany({
    data: notifications,
  });

  return result;
};
