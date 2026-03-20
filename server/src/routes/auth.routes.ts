import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth";

export const createAuthRoutes = (
  authController: AuthController = new AuthController(),
  protectedAuthMiddleware = authMiddleware,
) => {
  const authRoutes = new Hono();

  authRoutes.post("/registration", (c) => authController.register(c));
  authRoutes.post("/login", (c) => authController.login(c));
  authRoutes.get("/session", (c) => authController.session(c));
  authRoutes.post("/refresh", (c) => authController.refresh(c));
  authRoutes.get("/refresh", (c) => authController.refresh(c));
  authRoutes.post("/logout", (c) => authController.logout(c));
  authRoutes.patch("/username", protectedAuthMiddleware, (c) => authController.updateUsername(c));
  authRoutes.get("/publicKeys", protectedAuthMiddleware, (c) => authController.getPublicKeys(c));

  return authRoutes;
};

const authRoutes = createAuthRoutes();

export default authRoutes;
