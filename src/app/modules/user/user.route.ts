import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest";
import {
  deleteUserController,
  getAllUsersController,
  getMyProfileController,
  getUserByIdController,
  softDeleteUserController,
  toggleUserStatusController,
  updateMyProfileController,
  updateUserController,
  updateUserRoleController,
} from "./user.controller";
import { userValidation } from "./user.validation";
import { fileUploader } from "../../../utils/fileUploader";

const userRouter = Router();

const fileUpload = fileUploader.upload.fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
  { name: "files", maxCount: 1 },
]);

userRouter.get(["/", "/all"], getAllUsersController);
userRouter.get("/me", getMyProfileController);

userRouter.patch(
  "/update-me",
  fileUpload,
  validateRequest(userValidation.updateMyProfileSchema),
  updateMyProfileController,
);

userRouter.patch(
  "/:id/role",
  validateRequest(userValidation.updateUserRoleSchema),
  updateUserRoleController,
);

userRouter.patch(
  "/:id/status",
  validateRequest(userValidation.getUserByIdSchema),
  toggleUserStatusController,
);

userRouter.patch(
  "/:id/soft-delete",
  validateRequest(userValidation.getUserByIdSchema),
  softDeleteUserController,
);

userRouter.get(
  "/:id",
  validateRequest(userValidation.getUserByIdSchema),
  getUserByIdController,
);

userRouter.put(
  "/:id",
  validateRequest(userValidation.updateUserSchema),
  updateUserController,
);

userRouter.delete(
  "/:id",
  validateRequest(userValidation.deleteUserSchema),
  deleteUserController,
);

export default userRouter;
