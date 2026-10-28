import express from "express";
import { obtenerConteoPersonasNivelesHik, obtenerPersonasNivelAccesoHik, obtenerDashboardEventosHik } from "../services/hikCentralService.js";
import {
  registrarSalida,
  obtenerSalidasHoy,
  obtenerPendientes,
  obtenerActividadReciente,
  obtenerSalidasPorFecha,
  obtenerNivelesAcceso
} from "../controllers/salidasController.js";

const router = express.Router();

router.post("/", registrarSalida);
router.get("/hoy", obtenerSalidasHoy);
router.get("/pendientes", obtenerPendientes);
router.get("/actividad", obtenerActividadReciente);
router.get("/reporte", obtenerSalidasPorFecha);
router.get("/niveles-acceso", obtenerNivelesAcceso);
router.get("/dashboard-eventos", async (req, res) => {
  try {
    const fechaInicio = String(req.query.fecha_inicio || "").trim();
    const fechaFin = String(req.query.fecha_fin || "").trim();
    const data = await obtenerDashboardEventosHik(fechaInicio, fechaFin);
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Error consultando eventos para dashboard:", error.message);
    return res.status(502).json({ ok: false, message: error.message || "Error consultando eventos de HikCentral." });
  }
});

router.get("/niveles-acceso/personas", async (req, res) => {
  try {
    const nivelId = String(req.query.nivelId || "").trim();
    const data = await obtenerPersonasNivelAccesoHik(nivelId);
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Error consultando alumnos del nivel de HikCentral:", error.message);
    return res.status(502).json({ ok: false, message: error.message || "Error consultando alumnos de HikCentral." });
  }
});

router.get("/niveles-acceso/conteos", async (req, res) => {
  try {
    const nivelId = String(req.query.nivelId || "").trim();
    const data = await obtenerConteoPersonasNivelesHik(nivelId);
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Error consultando conteos de HikCentral:", error.message);
    return res.status(502).json({ ok: false, message: error.message || "Error consultando conteos de HikCentral." });
  }
});

export default router;