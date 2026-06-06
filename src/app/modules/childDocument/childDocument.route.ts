import express from "express";
import auth from "../../middlewares/auth";
import validateRequest from "../../middlewares/validateRequest";
import { childDocumentValidation } from "./childDocument.validation";
import { fileUploader } from "../../../utils/fileUploader";
import { childDocumentController } from "./childDocument.controller";

const router = express.Router();
const fileUpload = fileUploader.upload.fields([
  { name: "image", maxCount: 1 },
  { name: "video", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
  { name: "files", maxCount: 1 },
]);

router.post(
  "/",
  auth(),
  fileUpload,
  validateRequest(childDocumentValidation.createSchema),
  childDocumentController.createChildDocument,
);

router.get("/", auth(), childDocumentController.getChildDocumentList);

router.get("/all/:childId", auth(), childDocumentController.getMyChildDocument);

router.get("/:id", auth(), childDocumentController.getChildDocumentById);

router.put(
  "/:id",
  auth(),
  fileUpload,
  validateRequest(childDocumentValidation.updateSchema),
  childDocumentController.updateChildDocument,
);

router.patch(
  "/toggle-status/:id",
  auth(),
  childDocumentController.toggleStatusChildDocument,
);

router.delete(
  "/soft-delete/:id",
  auth(),
  childDocumentController.softDeleteChildDocument,
);

router.delete("/:id", auth(), childDocumentController.deleteChildDocument);

export const childDocumentRouter = router;
