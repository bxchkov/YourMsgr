import "dotenv/config";
import { createRealtimeServer } from "./bootstrap/realtime";
import { logger } from "./utils/logger";

const port = Number(process.env.PORT) || 3000;

await createRealtimeServer({ port });

logger.info(`Server running on http://localhost:${port}`);
