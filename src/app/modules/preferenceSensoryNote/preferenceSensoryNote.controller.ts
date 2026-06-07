import httpStatus from 'http-status';
import { preferenceSensoryNoteService } from './preferenceSensoryNote.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const preferenceSensoryNoteFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create PreferenceSensoryNote
const createPreferenceSensoryNote = catchAsync(async (req: Request, res: Response) => {
  const result = await preferenceSensoryNoteService.createPreferenceSensoryNote(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'PreferenceSensoryNote created successfully',
    data: result,
  });
});

// get all PreferenceSensoryNote
const getPreferenceSensoryNoteList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, preferenceSensoryNoteFilterableFields);
  const result = await preferenceSensoryNoteService.getPreferenceSensoryNoteList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'PreferenceSensoryNote list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get PreferenceSensoryNote by id
const getPreferenceSensoryNoteById = catchAsync(async (req: Request, res: Response) => {
  const result = await preferenceSensoryNoteService.getPreferenceSensoryNoteById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'PreferenceSensoryNote details retrieved successfully',
    data: result,
  });
});

// get my PreferenceSensoryNote
const getMyPreferenceSensoryNote = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, preferenceSensoryNoteFilterableFields);
  const result = await preferenceSensoryNoteService.getMyPreferenceSensoryNote(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My PreferenceSensoryNote list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update PreferenceSensoryNote
const updatePreferenceSensoryNote = catchAsync(async (req: Request, res: Response) => {
  const result = await preferenceSensoryNoteService.updatePreferenceSensoryNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'PreferenceSensoryNote updated successfully',
    data: result,
  });
});

// toggle status PreferenceSensoryNote
const toggleStatusPreferenceSensoryNote = catchAsync(async (req: Request, res: Response) => {
  const result = await preferenceSensoryNoteService.toggleStatusPreferenceSensoryNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'PreferenceSensoryNote status toggled successfully',
    data: result,
  });
});

// soft delete PreferenceSensoryNote
const softDeletePreferenceSensoryNote = catchAsync(async (req: Request, res: Response) => {
  const result = await preferenceSensoryNoteService.softDeletePreferenceSensoryNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'PreferenceSensoryNote soft deleted successfully',
    data: result,
  });
});

// hard delete PreferenceSensoryNote
const deletePreferenceSensoryNote = catchAsync(async (req: Request, res: Response) => {
  const result = await preferenceSensoryNoteService.deletePreferenceSensoryNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'PreferenceSensoryNote deleted successfully',
    data: result,
  });
});

export const preferenceSensoryNoteController = {
  createPreferenceSensoryNote,
  getPreferenceSensoryNoteList,
  getPreferenceSensoryNoteById,
  getMyPreferenceSensoryNote,
  updatePreferenceSensoryNote,
  toggleStatusPreferenceSensoryNote,
  softDeletePreferenceSensoryNote,
  deletePreferenceSensoryNote,
};