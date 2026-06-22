import type { Response } from "express";

interface SendResponseOptions<T> {
  statusCode: number;
  success: boolean;
  message: string;
  meta?: {
    page: number;
    limit: number;
    total: number;
    nextCursor?: string | null;
  };
  data?: T | null | undefined;
}

const sendResponse = <T>(res: Response, jsonData: SendResponseOptions<T>) => {
  if (jsonData.data === undefined) {
    delete jsonData.data;
  }
  if (jsonData.meta === undefined) {
    delete jsonData.meta;
  }
  return res.status(jsonData.statusCode).json(jsonData);
};

export default sendResponse;