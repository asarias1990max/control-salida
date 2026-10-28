import express from "express";
import { supabase } from "../config/supabaseClient.js";
import { obtenerConteoPersonasNivelesHik, obtenerPersonasNivelAccesoHik, obtenerDashboardEventosHik, obtenerPuertasHik } from "../services/hikCentralService.js";
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
router.get("/dashboard-configuracion", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("configuracion_salidas")
      .select("nivel_acceso, hora_inicio, hora_fin, puertas, activo")
      .eq("activo", true)
      .order("hora_inicio", { ascending: true });
    if (error) throw error;
    return res.json({ ok: true, data: data || [] });
  } catch (error) {
    console.error("Error consultando configuración de salidas:", error.message);
    return res.status(500).json({ ok: false, message: error.message || "No se pudo cargar la configuración de salidas." });
  }
});

router.get("/dashboard-puertas", async (req, res) => {
  try {
    const data = await obtenerPuertasHik();
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Error consultando puertas de HikCentral:", error.message);
    return res.status(502).json({ ok: false, message: error.message || "Error consultando puertas de HikCentral." });
  }
});

router.get("/dashboard-eventos", async (req, res) => {
  try {
    const fechaInicio = String(req.query.fecha_inicio || "").trim();
    const fechaFin = String(req.query.fecha_fin || "").trim();
    const rawCodes = String(req.query.door_codes || "").trim();
    const doorCodes = rawCodes ? rawCodes.split(",").map(code => code.trim()).filter(Boolean) : [];
    const data = await obtenerDashboardEventosHik(fechaInicio, fechaFin, doorCodes);
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