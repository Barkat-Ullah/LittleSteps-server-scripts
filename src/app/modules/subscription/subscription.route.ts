import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { subscriptionController } from "./subscription.controller";
import { subscriptionValidation } from "./subscription.validation";

const router = express.Router();

router.post(
  "/",
  auth(),
  validateRequest(subscriptionValidation.createSchema),
  subscriptionController.createSubscription,
);

router.get("/", auth(), subscriptionController.getSubscriptionList);
router.get(
  "/paid-user",
  auth(),
  subscriptionController.getUserSubscriptionList,
);
router.get("/my-plan", auth(), subscriptionController.getMyPlan);
router.get("/:id", auth(), subscriptionController.getSubscriptionById);

router.post(
  "/buy-on-link",
  auth(),
  subscriptionController.buySubscriptionOnLink,
);
router.post("/buy-on-app", auth(), subscriptionController.buySubscriptionOnApp);
router.post("/cancel-plan", auth(), subscriptionController.cancelMyPlan);

router.put(
  "/:id",
  auth(),
  validateRequest(subscriptionValidation.updateSchema),
  subscriptionController.updateSubscription,
);

router.delete("/:id", auth(), subscriptionController.deleteSubscription);

export const subscriptionRoutes = router;
