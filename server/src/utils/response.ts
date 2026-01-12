import { Context } from "hono";

interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
}

export const sendResponse = (
  c: Context,
  status: number,
  success: boolean,
  message?: string,
  data?: any
) => {
  return c.json({ success, message, data } as ApiResponse, status);
};

export const sendSuccess = (c: Context, message: string, data?: any) => {
  return sendResponse(c, 200, true, message, data);
};

export const sendError = (c: Context, status: number, message: string) => {
  return sendResponse(c, status, false, message);
};
