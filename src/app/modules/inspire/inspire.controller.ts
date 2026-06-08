import httpStatus from 'http-status';
import { inspireService } from './inspire.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const inspireFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create Inspire
const createInspire = catchAsync(async (req: Request, res: Response) => {
  const result = await inspireService.createInspire(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Inspire created successfully',
    data: result,
  });
});

// get all Inspire
const getInspireList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, inspireFilterableFields);
  const result = await inspireService.getInspireList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Inspire list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get Inspire by id
const getInspireById = catchAsync(async (req: Request, res: Response) => {
  const result = await inspireService.getInspireById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Inspire details retrieved successfully',
    data: result,
  });
});

// get my Inspire
const getMyInspire = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, inspireFilterableFields);
  const result = await inspireService.getMyInspire(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My Inspire list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update Inspire
const updateInspire = catchAsync(async (req: Request, res: Response) => {
  const result = await inspireService.updateInspire(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Inspire updated successfully',
    data: result,
  });
});

// toggle status Inspire
const toggleStatusInspire = catchAsync(async (req: Request, res: Response) => {
  const result = await inspireService.toggleStatusInspire(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Inspire status toggled successfully',
    data: result,
  });
});

// soft delete Inspire
const softDeleteInspire = catchAsync(async (req: Request, res: Response) => {
  const result = await inspireService.softDeleteInspire(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Inspire soft deleted successfully',
    data: result,
  });
});

// hard delete Inspire
const deleteInspire = catchAsync(async (req: Request, res: Response) => {
  const result = await inspireService.deleteInspire(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Inspire deleted successfully',
    data: result,
  });
});

export const inspireController = {
  createInspire,
  getInspireList,
  getInspireById,
  getMyInspire,
  updateInspire,
  toggleStatusInspire,
  softDeleteInspire,
  deleteInspire,
};