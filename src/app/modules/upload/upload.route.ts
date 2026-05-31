import { Router } from "express";
import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse";
import {
  createFileUploadMiddleware,
  createMultiFileUploadMiddleware,
} from "../../middlewares/fileUpload";

const uploadRouter = Router();

uploadRouter.post(
  "/",
  createFileUploadMiddleware({
    fieldName: "file",
    subDir: "posts",
    // bump if you expect large videos
    maxBytes: 250 * 1024 * 1024,
    allowedFormats: ["jpeg", "png", "webp", "gif", "mp4"],
    optimizeImages: true,
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 80,
    // Optionally force smaller output format:
    // outputImageFormat: "webp",
  }),
  (req, res) => {
    const uploadedFile = (req as any).uploadedFile;
    const url = uploadedFile?.url;
    return sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "File uploaded successfully",
      data: { url, file: uploadedFile },
    });
  },
);

uploadRouter.post(
  "/multiple",
  createMultiFileUploadMiddleware({
    fieldName: "files",
    subDir: "posts",
    maxBytes: 250 * 1024 * 1024,
    allowedFormats: ["jpeg", "png", "webp", "gif", "mp4"],
    optimizeImages: true,
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 80,
  }),
  (req, res) => {
    const uploadedFiles = (req as any).uploadedFiles ?? [];
    const urls = uploadedFiles.map((f: any) => f.url);
    return sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Files uploaded successfully",
      data: { urls, files: uploadedFiles },
    });
  },
);

export default uploadRouter;
