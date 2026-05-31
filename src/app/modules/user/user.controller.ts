import type { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { UserServices } from "./user.service";
import pick from "../../../shared/pick";

const getFilterableFields = ["searchTerm", "status"];

export const getAllUsersController = catchAsync(
  async (req: Request, res: Response) => {
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
    const filters = pick(req.query, getFilterableFields);
    const result = await UserServices.getAllUsersFromDB(options, filters);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Users retrieved successfully",
      ...result,
    });
  },
);

export const getMyProfileController = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const result = await UserServices.getMyProfileFromDB(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "My profile retrieved successfully",
      data: result,
    });
  },
);

export const getUserByIdController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await UserServices.getUserDetailsFromDB(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User retrieved successfully",
      data: result,
    });
  },
);

export const updateMyProfileController = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const payload =
      typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;
    const result = await UserServices.updateMyProfileIntoDb(payload, userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "My profile updated successfully",
      data: result,
    });
  },
);

export const updateUserRoleController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;
    const result = await UserServices.updateUserRoleIntoDb(id, role);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User role updated successfully",
      data: result,
    });
  },
);

export const toggleUserStatusController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await UserServices.toggleUserStatus(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User status toggled successfully",
      data: result,
    });
  },
);

export const softDeleteUserController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await UserServices.softDeleteUserById(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User soft deleted successfully",
      data: result,
    });
  },
);

export const updateUserController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const payload =
      typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;
    const result = await UserServices.updateUserIntoDb(payload, id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User updated successfully",
      data: result,
    });
  },
);

export const deleteUserController = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await UserServices.deleteUserFromDB(id);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User deleted successfully",
      data: result,
    });
  },
);
