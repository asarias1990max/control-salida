import express from "express";
import { login, googleLogin, getGoogleConfig } from "../controllers/authController.js";
import { exigirSesion, renovarSesionActual, cerrarSesion } from "../services/sessionService.js";

const router = express.Router();

router.post("/login", login);
router.post("/auth/google", googleLogin);
router.get("/google/config", getGoogleConfig);

// Consultar la sesión activa desde la cookie HttpOnly.
router.get("/auth/session", (req, res) => {
  const usuario = renovarSesionActual(req, res);
  if (!usuario) {
    return res.status(401).json({ ok: false, code: "SESSION_EXPIRED", message: "No existe una sesión activa." });
  }
  return res.json({ ok: true, user: usuario });
});

// Mantener viva la sesión únicamente cuando el usuario sigue interactuando.
router.post("/auth/activity", exigirSesion, (req, res) => {
  return res.json({ ok: true });
});

router.post("/auth/logout", (req, res) => {
  cerrarSesion(req, res);
  return res.json({ ok: true, message: "Sesión cerrada." });
});

// Ruta de prueba
router.get("/test", (req, res) => {
  res.json({ ok: true, message: "Test route works" });
});

export default router;