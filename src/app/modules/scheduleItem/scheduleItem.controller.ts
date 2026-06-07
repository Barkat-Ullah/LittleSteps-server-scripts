import httpStatus from 'http-status';
import { scheduleItemService } from './scheduleItem.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const scheduleItemFilterableFields = ['searchTerm', 'id', 'createdAt', 'status', 'itemType'];
const dateFilterableFields = ['searchTerm', 'date', 'childId', 'status', 'itemType'];

// create ScheduleItem
const createScheduleItem = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleItemService.createScheduleItem(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'ScheduleItem created successfully',
    data: result,
  });
});

// get all ScheduleItem (admin/global)
const getScheduleItemList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, scheduleItemFilterableFields);
  const result = await scheduleItemService.getScheduleItemList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ScheduleItem list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get ScheduleItems by date — unified event + activity list for a day
// Query params: date (YYYY-MM-DD, required), childId?, status?, itemType?, page?, limit?
const getScheduleItemListByDate = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, dateFilterableFields);
  const result = await scheduleItemService.getScheduleItemListByDate(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ScheduleItems retrieved successfully for the given date',
    meta: result?.meta,
    data: result?.data,
  });
});

// get monthly schedule — dot indicators for calendar view
// Query params: month (YYYY-MM, required)
const getMonthlyScheduleItems = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleItemService.getMonthlyScheduleItems(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Monthly schedule retrieved successfully',
    data: result,
  });
});

// get ScheduleItem by id
const getScheduleItemById = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleItemService.getScheduleItemById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ScheduleItem details retrieved successfully',
    data: result,
  });
});

// get my ScheduleItem (user-scoped management list)
const getMyScheduleItem = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, scheduleItemFilterableFields);
  const result = await scheduleItemService.getMyScheduleItem(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My ScheduleItem list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update ScheduleItem
const updateScheduleItem = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleItemService.updateScheduleItem(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ScheduleItem updated successfully',
    data: result,
  });
});

// toggle status (Pending <-> Completed)
const toggleStatusScheduleItem = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleItemService.toggleStatusScheduleItem(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ScheduleItem status toggled successfully',
    data: result,
  });
});

// soft delete ScheduleItem
const softDeleteScheduleItem = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleItemService.softDeleteScheduleItem(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ScheduleItem soft deleted successfully',
    data: result,
  });
});

// hard delete ScheduleItem
const deleteScheduleItem = catchAsync(async (req: Request, res: Response) => {
  const result = await scheduleItemService.deleteScheduleItem(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ScheduleItem deleted successfully',
    data: result,
  });
});

export const scheduleItemController = {
  createScheduleItem,
  getScheduleItemList,
  getScheduleItemListByDate,
  getMonthlyScheduleItems,
  getScheduleItemById,
  getMyScheduleItem,
  updateScheduleItem,
  toggleStatusScheduleItem,
  softDeleteScheduleItem,
  deleteScheduleItem,
};