import httpStatus from 'http-status';
import { taskService } from './task.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const taskFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create Task
const createTask = catchAsync(async (req: Request, res: Response) => {
  const result = await taskService.createTask(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Task created successfully',
    data: result,
  });
});

// get all Task
const getTaskList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, taskFilterableFields);
  const result = await taskService.getTaskList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task list retrieved successfully',
    meta: result?.meta,
    data: result?.data,
  });
});

// get Task by id
const getTaskById = catchAsync(async (req: Request, res: Response) => {
  const result = await taskService.getTaskById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task details retrieved successfully',
    data: result,
  });
});

// get my Task
const getMyTask = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, taskFilterableFields);
  const result = await taskService.getMyTask(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My Task list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update Task
const updateTask = catchAsync(async (req: Request, res: Response) => {
  const result = await taskService.updateTask(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task updated successfully',
    data: result,
  });
});

// toggle status Task
const toggleStatusTask = catchAsync(async (req: Request, res: Response) => {
  const result = await taskService.toggleStatusTask(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task status toggled successfully',
    data: result,
  });
});

// soft delete Task
const softDeleteTask = catchAsync(async (req: Request, res: Response) => {
  const result = await taskService.softDeleteTask(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task soft deleted successfully',
    data: result,
  });
});

// hard delete Task
const deleteTask = catchAsync(async (req: Request, res: Response) => {
  const result = await taskService.deleteTask(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task deleted successfully',
    data: result,
  });
});

export const taskController = {
  createTask,
  getTaskList,
  getTaskById,
  getMyTask,
  updateTask,
  toggleStatusTask,
  softDeleteTask,
  deleteTask,
};