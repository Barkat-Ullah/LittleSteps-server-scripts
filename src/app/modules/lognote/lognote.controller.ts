import httpStatus from 'http-status';
import { lognoteService } from './lognote.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const lognoteFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
];

// create Lognote
const createLognote = catchAsync(async (req: Request, res: Response) => {
  const result = await lognoteService.createLognote(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Lognote created successfully',
    data: result,
  });
});

// get all Lognote
const getLognoteList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, lognoteFilterableFields);
  const result = await lognoteService.getLognoteList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Lognote list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get Lognote by id
const getLognoteById = catchAsync(async (req: Request, res: Response) => {
  const result = await lognoteService.getLognoteById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Lognote details retrieved successfully',
    data: result,
  });
});

// get my Lognote
const getMyLognote = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, lognoteFilterableFields);
  const result = await lognoteService.getMyLognote(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My Lognote list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update Lognote
const updateLognote = catchAsync(async (req: Request, res: Response) => {
  const result = await lognoteService.updateLognote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Lognote updated successfully',
    data: result,
  });
});

// toggle status Lognote
const toggleStatusLognote = catchAsync(async (req: Request, res: Response) => {
  const result = await lognoteService.toggleStatusLognote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Lognote status toggled successfully',
    data: result,
  });
});

// soft delete Lognote
const softDeleteLognote = catchAsync(async (req: Request, res: Response) => {
  const result = await lognoteService.softDeleteLognote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Lognote soft deleted successfully',
    data: result,
  });
});

// hard delete Lognote
const deleteLognote = catchAsync(async (req: Request, res: Response) => {
  const result = await lognoteService.deleteLognote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Lognote deleted successfully',
    data: result,
  });
});

export const lognoteController = {
  createLognote,
  getLognoteList,
  getLognoteById,
  getMyLognote,
  updateLognote,
  toggleStatusLognote,
  softDeleteLognote,
  deleteLognote,
};