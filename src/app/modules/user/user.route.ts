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

const userRouter = Router();

userRouter.get(["/", "/all"], getAllUsersController);
userRouter.get("/me", getMyProfileController);
userRouter.patch(
  "/me",
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
