import httpStatus from 'http-status';
import { healthCareNoteService } from './healthCareNote.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const healthCareNoteFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create HealthCareNote
const createHealthCareNote = catchAsync(async (req: Request, res: Response) => {
  const result = await healthCareNoteService.createHealthCareNote(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'HealthCareNote created successfully',
    data: result,
  });
});

// get all HealthCareNote
const getHealthCareNoteList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, healthCareNoteFilterableFields);
  const result = await healthCareNoteService.getHealthCareNoteList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'HealthCareNote list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get HealthCareNote by id
const getHealthCareNoteById = catchAsync(async (req: Request, res: Response) => {
  const result = await healthCareNoteService.getHealthCareNoteById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'HealthCareNote details retrieved successfully',
    data: result,
  });
});

// get my HealthCareNote
const getMyHealthCareNote = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, healthCareNoteFilterableFields);
  const result = await healthCareNoteService.getMyHealthCareNote(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My HealthCareNote list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update HealthCareNote
const updateHealthCareNote = catchAsync(async (req: Request, res: Response) => {
  const result = await healthCareNoteService.updateHealthCareNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'HealthCareNote updated successfully',
    data: result,
  });
});

// toggle status HealthCareNote
const toggleStatusHealthCareNote = catchAsync(async (req: Request, res: Response) => {
  const result = await healthCareNoteService.toggleStatusHealthCareNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'HealthCareNote status toggled successfully',
    data: result,
  });
});

// soft delete HealthCareNote
const softDeleteHealthCareNote = catchAsync(async (req: Request, res: Response) => {
  const result = await healthCareNoteService.softDeleteHealthCareNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'HealthCareNote soft deleted successfully',
    data: result,
  });
});

// hard delete HealthCareNote
const deleteHealthCareNote = catchAsync(async (req: Request, res: Response) => {
  const result = await healthCareNoteService.deleteHealthCareNote(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'HealthCareNote deleted successfully',
    data: result,
  });
});

export const healthCareNoteController = {
  createHealthCareNote,
  getHealthCareNoteList,
  getHealthCareNoteById,
  getMyHealthCareNote,
  updateHealthCareNote,
  toggleStatusHealthCareNote,
  softDeleteHealthCareNote,
  deleteHealthCareNote,
};