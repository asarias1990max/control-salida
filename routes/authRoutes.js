import express from "express";
import { login, establecerPassword, googleLogin, getGoogleConfig } from "../controllers/authController.js";
import { exigirSesion, registrarActividad, renovarSesionActual, cerrarSesion } from "../services/sessionService.js";

const router = express.Router();

router.post("/login", login);
router.post("/auth/google", googleLogin);
router.get("/google/config", getGoogleConfig);
router.post("/auth/password", exigirSesion, establecerPassword);

router.get("/auth/session", async (req, res) => {
  try {
    const usuario = await renovarSesionActual(req, res);
    if (!usuario) {
      return res.status(401).json({ ok: false, code: "SESSION_EXPIRED", message: "No existe una sesión activa." });
    }
    return res.json({ ok: true, user: usuario });
  } catch (error) {
    console.error("Error validando sesión:", error.message);
    return res.status(503).json({ ok: false, code: "SESSION_STORE_UNAVAILABLE", message: "No se pudo validar la sesión. Intenta nuevamente." });
  }
});

router.post("/auth/activity", registrarActividad, (req, res) => res.json({ ok: true }));

router.post("/auth/logout", async (req, res) => {
  try {
    await cerrarSesion(req, res);
    return res.json({ ok: true, message: "Sesión cerrada." });
  } catch (error) {
    console.error("Error cerrando sesión:", error.message);
    return res.status(500).json({ ok: false, message: "No se pudo cerrar completamente la sesión." });
  }
});

router.get("/test", (req, res) => res.json({ ok: true, message: "Test route works" }));

export default router;
