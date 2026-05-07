import express from "express";
import { login, googleLogin, getGoogleConfig } from "../controllers/authController.js";

const router = express.Router();

router.post("/login", login);
router.post("/auth/google", googleLogin);
router.get("/google/config", getGoogleConfig);

// Ruta de prueba
router.get("/test", (req, res) => {
  res.json({ ok: true, message: "Test route works" });
});

export default router;