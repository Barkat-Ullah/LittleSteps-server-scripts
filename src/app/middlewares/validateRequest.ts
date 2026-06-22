import type { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod"; 

const validateRequest = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let currentBody = req.body;

      if (currentBody && typeof currentBody.data === "string") {
        try {
          currentBody = JSON.parse(currentBody.data);
        } catch (err) {
   
        }
      }
      const validatedBody = await schema.parseAsync(currentBody);
      req.body = validatedBody;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default validateRequest;