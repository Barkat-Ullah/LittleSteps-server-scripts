import httpStatus from 'http-status';
import { childDocumentService } from './childDocument.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const childDocumentFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create ChildDocument
const createChildDocument = catchAsync(async (req: Request, res: Response) => {
  const result = await childDocumentService.createChildDocument(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'ChildDocument created successfully',
    data: result,
  });
});

// get all ChildDocument
const getChildDocumentList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, childDocumentFilterableFields);
  const result = await childDocumentService.getChildDocumentList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ChildDocument list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get ChildDocument by id
const getChildDocumentById = catchAsync(async (req: Request, res: Response) => {
  const result = await childDocumentService.getChildDocumentById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ChildDocument details retrieved successfully',
    data: result,
  });
});

// get my ChildDocument
const getMyChildDocument = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, childDocumentFilterableFields);
  const result = await childDocumentService.getMyChildDocument(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My ChildDocument list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update ChildDocument
const updateChildDocument = catchAsync(async (req: Request, res: Response) => {
  const result = await childDocumentService.updateChildDocument(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ChildDocument updated successfully',
    data: result,
  });
});

// toggle status ChildDocument
const toggleStatusChildDocument = catchAsync(async (req: Request, res: Response) => {
  const result = await childDocumentService.toggleStatusChildDocument(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ChildDocument status toggled successfully',
    data: result,
  });
});

// soft delete ChildDocument
const softDeleteChildDocument = catchAsync(async (req: Request, res: Response) => {
  const result = await childDocumentService.softDeleteChildDocument(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ChildDocument soft deleted successfully',
    data: result,
  });
});

// hard delete ChildDocument
const deleteChildDocument = catchAsync(async (req: Request, res: Response) => {
  const result = await childDocumentService.deleteChildDocument(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'ChildDocument deleted successfully',
    data: result,
  });
});

export const childDocumentController = {
  createChildDocument,
  getChildDocumentList,
  getChildDocumentById,
  getMyChildDocument,
  updateChildDocument,
  toggleStatusChildDocument,
  softDeleteChildDocument,
  deleteChildDocument,
};