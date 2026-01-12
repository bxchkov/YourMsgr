import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth";

const authRoutes = new Hono();
const authController = new AuthController();

authRoutes.post("/registration", (c) => authController.register(c));
authRoutes.post("/login", (c) => authController.login(c));
authRoutes.get("/session", (c) => authController.session(c));
authRoutes.get("/refresh", (c) => authController.refresh(c));
authRoutes.post("/logout", authMiddleware, (c) => authController.logout(c));

export default authRoutes;
