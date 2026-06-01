import httpStatus from 'http-status';
import { childrenService } from './children.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const childrenFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
];

// create Children
const createChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await childrenService.createChildren(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Children created successfully',
    data: result,
  });
});

// get all Children
const getChildrenList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, childrenFilterableFields);
  const result = await childrenService.getChildrenList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Children list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get Children by id
const getChildrenById = catchAsync(async (req: Request, res: Response) => {
  const result = await childrenService.getChildrenById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Children details retrieved successfully',
    data: result,
  });
});

// get my Children
const getMyChildren = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, childrenFilterableFields);
  const result = await childrenService.getMyChildren(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My Children list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update Children
const updateChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await childrenService.updateChildren(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Children updated successfully',
    data: result,
  });
});

// toggle status Children
const toggleStatusChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await childrenService.toggleStatusChildren(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Children status toggled successfully',
    data: result,
  });
});

// soft delete Children
const softDeleteChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await childrenService.softDeleteChildren(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Children soft deleted successfully',
    data: result,
  });
});

// hard delete Children
const deleteChildren = catchAsync(async (req: Request, res: Response) => {
  const result = await childrenService.deleteChildren(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Children deleted successfully',
    data: result,
  });
});

export const childrenController = {
  createChildren,
  getChildrenList,
  getChildrenById,
  getMyChildren,
  updateChildren,
  toggleStatusChildren,
  softDeleteChildren,
  deleteChildren,
};