import httpStatus from 'http-status';
import { contactService } from './contact.service';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const contactFilterableFields = [
  'searchTerm',
  'id',
  'createdAt',
  'status',
];

// create Contact
const createContact = catchAsync(async (req: Request, res: Response) => {
  const result = await contactService.createContact(req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Contact created successfully',
    data: result,
  });
});

// get all Contact
const getContactList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, contactFilterableFields);
  const result = await contactService.getContactList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Contact list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// get Contact by id
const getContactById = catchAsync(async (req: Request, res: Response) => {
  const result = await contactService.getContactById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Contact details retrieved successfully',
    data: result,
  });
});

// get my Contact
const getMyContact = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const filters = pick(req.query, contactFilterableFields);
  const result = await contactService.getMyContact(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My Contact list retrieved successfully',
    data: result?.data,
    meta: result?.meta,
  });
});

// update Contact
const updateContact = catchAsync(async (req: Request, res: Response) => {
  const result = await contactService.updateContact(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Contact updated successfully',
    data: result,
  });
});

// toggle status Contact
const toggleStatusContact = catchAsync(async (req: Request, res: Response) => {
  const result = await contactService.toggleStatusContact(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Contact status toggled successfully',
    data: result,
  });
});

// soft delete Contact
const softDeleteContact = catchAsync(async (req: Request, res: Response) => {
  const result = await contactService.softDeleteContact(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Contact soft deleted successfully',
    data: result,
  });
});

// hard delete Contact
const deleteContact = catchAsync(async (req: Request, res: Response) => {
  const result = await contactService.deleteContact(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Contact deleted successfully',
    data: result,
  });
});

export const contactController = {
  createContact,
  getContactList,
  getContactById,
  getMyContact,
  updateContact,
  toggleStatusContact,
  softDeleteContact,
  deleteContact,
};