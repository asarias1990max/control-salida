import express from "express";
import { supabase } from "../config/supabaseClient.js";
import { obtenerConteoPersonasNivelesHik, obtenerPersonasNivelAccesoHik, obtenerDashboardEventosHik, obtenerPuertasHik, sincronizarNivelesYAsignacionesHik } from "../services/hikCentralService.js";
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
router.post("/dashboard-niveles/sincronizar", async (req, res) => {
  try {
    const data = await sincronizarNivelesYAsignacionesHik();
    return res.json({ ok: true, data });
  } catch (error) {
    console.error("Error sincronizando niveles y estudiantes HikCentral:", error.message);
    return res.status(502).json({ ok: false, message: error.message || "No se pudieron sincronizar los niveles de acceso." });
  }
});

router.get("/dashboard-niveles-estudiantes", async (req, res) => {
  try {
    const [asignacionesResult, configuracionResult] = await Promise.all([
      supabase.from("estudiante_niveles_acceso_hikcentral")
        .select("estudiante_id, privilege_group_id, person_id_hik, estudiantes(codigo, codigo_hik, apellidos, nombres, seccion, curso, paralelo), niveles_acceso_hikcentral(nombre, descripcion, hora_salida, time_schedule_name, time_schedule_index_code)")
        .order("estudiante_id", { ascending: true }),
      supabase.from("configuracion_salidas")
        .select("nivel_acceso, hora_inicio, hora_fin, puertas")
        .eq("activo", true)
    ]);
    if (asignacionesResult.error) throw asignacionesResult.error;
    if (configuracionResult.error) throw configuracionResult.error;
    const configuraciones = configuracionResult.data || [];
    const configuracionPorNombre = new Map(configuraciones.map(c => [String(c.nivel_acceso).trim().toLowerCase(), c]));
    const data = (asignacionesResult.data || []).map(row => {
      const estudiante = row.estudiantes || {};
      const nivel = row.niveles_acceso_hikcentral || {};
      const config = configuracionPorNombre.get(String(nivel.nombre || "").trim().toLowerCase());
      const horaNivel = nivel.hora_salida || null;
      return {
        estudiante_id: row.estudiante_id,
        codigo: estudiante.codigo || "",
        codigo_hik: estudiante.codigo_hik || "",
        estudiante: [estudiante.apellidos, estudiante.nombres].filter(Boolean).join(" ").trim(),
        seccion: estudiante.seccion || "",
        curso: estudiante.curso || "",
        paralelo: estudiante.paralelo || "",
        privilege_group_id: row.privilege_group_id,
        nivel_acceso: nivel.nombre || "Nivel sin nombre",
        hora_salida_nivel: horaNivel,
        horario_hikcentral_nombre: nivel.time_schedule_name || "",
        horario_hikcentral_id: nivel.time_schedule_index_code || "",
        hora_inicio_configurada: config?.hora_inicio || null,
        hora_fin_configurada: config?.hora_fin || null,
        puertas_configuradas: config?.puertas || [],
        fuente_horario: horaNivel ? "HikCentral: nombre/descripción" : config ? "Configuración escolar" : "Horario por verificar"
      };
    });
    return res.json({ ok: true, total: data.length, data });
  } catch (error) {
    console.error("Error consultando niveles por estudiante:", error.message);
    return res.status(500).json({ ok: false, message: error.message || "No se pudieron consultar los niveles de los estudiantes." });
  }
});

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