import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth";

const authRoutes = new Hono();
const authController = new AuthController();

authRoutes.post("/registration", (c) => authController.register(c));
authRoutes.post("/login", (c) => authController.login(c));
authRoutes.get("/session", (c) => authController.session(c));
authRoutes.get("/refresh", (c) => authController.refresh(c));
authRoutes.post("/logout", (c) => authController.logout(c));
authRoutes.patch("/username", authMiddleware, (c) => authController.updateUsername(c));
authRoutes.patch("/privateKey", authMiddleware, (c) => authController.updateEncryptedPrivateKey(c));
authRoutes.get("/publicKeys", authMiddleware, (c) => authController.getPublicKeys(c));

export default authRoutes;
