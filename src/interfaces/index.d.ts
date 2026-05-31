import type { JwtVariables } from "hono/jwt";
import type { RequestIdVariables } from "hono/request-id";
import type { StoredUploadFile } from "../app/middlewares/fileUpload";

declare module "hono" {
  interface ContextVariableMap {
    user: JwtVariables["jwtPayload"];
    requestId: RequestIdVariables["requestId"];
    uploadedFile: StoredUploadFile | undefined;
    uploadedFiles: StoredUploadFile[] | undefined;
  }
}
