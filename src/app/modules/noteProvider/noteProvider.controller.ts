import httpStatus from 'http-status';
import { noteProviderService } from './noteProvider.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const noteProviderFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create NoteProvider
const createNoteProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await noteProviderService.createNoteProvider(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'NoteProvider created successfully',
    data: result,
  });
});

// get all NoteProvider
const getNoteProviderList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, noteProviderFilterableFields);
  const result = await noteProviderService.getNoteProviderList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'NoteProvider list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get NoteProvider by id
const getNoteProviderById = catchAsync(async (req: Request, res: Response) => {
  const result = await noteProviderService.getNoteProviderById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'NoteProvider details retrieved successfully',
    data: result,
  });
});

// get my NoteProvider
const getMyNoteProvider = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, noteProviderFilterableFields);
  const result = await noteProviderService.getMyNoteProvider(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My NoteProvider list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update NoteProvider
const updateNoteProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await noteProviderService.updateNoteProvider(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'NoteProvider updated successfully',
    data: result,
  });
});

// toggle status NoteProvider
const toggleStatusNoteProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await noteProviderService.toggleStatusNoteProvider(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'NoteProvider status toggled successfully',
    data: result,
  });
});

// soft delete NoteProvider
const softDeleteNoteProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await noteProviderService.softDeleteNoteProvider(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'NoteProvider soft deleted successfully',
    data: result,
  });
});

// hard delete NoteProvider
const deleteNoteProvider = catchAsync(async (req: Request, res: Response) => {
  const result = await noteProviderService.deleteNoteProvider(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'NoteProvider deleted successfully',
    data: result,
  });
});

export const noteProviderController = {
  createNoteProvider,
  getNoteProviderList,
  getNoteProviderById,
  getMyNoteProvider,
  updateNoteProvider,
  toggleStatusNoteProvider,
  softDeleteNoteProvider,
  deleteNoteProvider,
};