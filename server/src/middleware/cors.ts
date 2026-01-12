import { cors } from "hono/cors";

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:5173",
];

export const corsMiddleware = cors({
  origin: allowedOrigins,
  credentials: true,
});
