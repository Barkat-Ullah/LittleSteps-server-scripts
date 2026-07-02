import { NextFunction, Request, RequestHandler, Response } from 'express';
import { notificationServices } from './notification.service';
import catchAsync from '#shared/catchAsync';
import sendResponse from '#shared/sendResponse';


const sseNotifyController: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  notificationServices.sseNotify(req, res, next);
};


// const sendNotification = catchAsync(async (req: any, res: any) => {
//   const notification = await notificationServices.sendSingleNotification(req);

//   sendResponse(res, {
//     statusCode: 200,
//     success: true,
//     message: 'notification sent successfully',
//     data: notification,
//   });
// });

// const sendNotifications = catchAsync(async (req: any, res: any) => {
//   const notifications = await notificationServices.sendNotifications(req);

//   sendResponse(res, {
//     statusCode: 200,
//     success: true,
//     message: 'notifications sent successfully',
//     data: notifications,
//   });
// });



const getMyNotification = catchAsync(async (req, res) => {

  const result = await notificationServices.getMyNotifications(req);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Notifications fetched successfully',
    data: result,
  });
});

const getNotifications = catchAsync(async (req: any, res: any) => {
  const notifications = await notificationServices.getNotificationsFromDB(req);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Notifications retrieved successfully',
    data: notifications,
  });
});

const getSingleNotificationById = catchAsync(async (req: any, res: any) => {
  const notificationId = req.params.notificationId;
  const notification = await notificationServices.getSingleNotificationFromDB(
    req,
    notificationId,
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: 'Notification retrieved successfully',
    data: notification,
  });
});

export const notificationController = {
  sseNotifyController,
  // sendNotification,
  // sendNotifications,
  getNotifications,
  getSingleNotificationById,
  getMyNotification,
};
