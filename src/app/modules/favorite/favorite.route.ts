import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { favoriteController } from "./favorite.controller";
import { favoriteValidation } from "./favorite.validation";

const router = express.Router();

//  Toggle favorite — POST /:taskId
router.post(
  "/:taskId",
  auth(),
  validateRequest(favoriteValidation.createSchema),
  favoriteController.createFavorite,
);

//  Check if specific task is favorited — GET /check/:taskId
router.get(
  "/check/:taskId",
  auth(),
  favoriteController.checkIsFavorite,
);

// Get all favorites (admin)
router.get("/", auth(), favoriteController.getFavoriteList);

// Get my favorites
router.get("/my", auth(), favoriteController.getMyFavorite);

// Get favorite by id
router.get("/:id", auth(), favoriteController.getFavoriteById);

export const favoriteRouter = router;