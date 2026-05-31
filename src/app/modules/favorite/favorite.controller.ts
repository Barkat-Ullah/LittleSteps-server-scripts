import httpStatus from "http-status";
import { favoriteService } from "./favorite.service";
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import pick from "../../../shared/pick";

const favoriteFilterableFields = ["searchTerm", "id", "createdAt"];

// Toggle Favorite (add or remove)
const createFavorite = catchAsync(async (req: Request, res: Response) => {
  const result = await favoriteService.createFavorite(req);
  sendResponse(res, {
    statusCode: result.isFavorite ? httpStatus.CREATED : httpStatus.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// Get all Favorites
const getFavoriteList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, favoriteFilterableFields);
  const result = await favoriteService.getFavoriteList(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Favorite list retrieved successfully",
    data: result?.data,
    meta: result?.meta,
  });
});

// Get Favorite by ID
const getFavoriteById = catchAsync(async (req: Request, res: Response) => {
  const result = await favoriteService.getFavoriteById(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Favorite details retrieved successfully",
    data: result,
  });
});

// Get my Favorites
const getMyFavorite = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, favoriteFilterableFields);
  const result = await favoriteService.getMyFavorite(req, options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My favorite list retrieved successfully",
    data: result?.data,
    meta: result?.meta,
  });
});

// Check if a task is favorited
const checkIsFavorite = catchAsync(async (req: Request, res: Response) => {
  const result = await favoriteService.checkIsFavorite(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Favorite status retrieved successfully",
    data: result,
  });
});

export const favoriteController = {
  createFavorite,
  getFavoriteList,
  getFavoriteById,
  getMyFavorite,
  checkIsFavorite,
};