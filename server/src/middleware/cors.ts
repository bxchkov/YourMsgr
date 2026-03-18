import { cors } from "hono/cors";

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "https://localhost",
];

export const corsMiddleware = cors({
  origin: allowedOrigins,
  credentials: true,
});
