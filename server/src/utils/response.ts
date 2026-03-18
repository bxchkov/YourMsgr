import { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

interface ApiResponse {
  success: boolean;
  message?: string;
  data?: unknown;
}

export const sendResponse = (
  c: Context,
  status: ContentfulStatusCode,
  success: boolean,
  message?: string,
  data?: unknown
) => {
  return c.json({ success, message, data } as ApiResponse, status);
};

export const sendSuccess = (c: Context, message: string, data?: unknown) => {
  return sendResponse(c, 200, true, message, data);
};

export const sendError = (c: Context, status: ContentfulStatusCode, message: string) => {
  return sendResponse(c, status, false, message);
};
