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
router.get("/dashboard-resumen-diario", async (req, res) => {
  try {
    const fecha = String(req.query.fecha || "").trim() || new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ ok: false, message: "La fecha debe tener formato AAAA-MM-DD." });
    const inicio = new Date(fecha + "T05:00:00.000Z");
    const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
    const [estudiantesResult, eventosResult, asignacionesResult, configuracionResult] = await Promise.all([
      supabase.from("estudiantes").select("id,codigo,codigo_hik,apellidos,nombres,seccion,curso,paralelo").eq("estado", true).order("apellidos", { ascending: true }),
      supabase.from("eventos_hikcentral").select("estudiante_id,codigo_hik,fecha_evento,puerta_codigo,puerta_nombre,tipo_evento,tipo_evento_codigo,resultado,datos_originales").gte("fecha_evento", inicio.toISOString()).lt("fecha_evento", fin.toISOString()).order("fecha_evento", { ascending: true }),
      supabase.from("estudiante_niveles_acceso_hikcentral").select("estudiante_id, privilege_group_id, niveles_acceso_hikcentral(nombre,hora_salida,time_schedule_name)"),
      supabase.from("configuracion_salidas").select("nivel_acceso,hora_inicio,hora_fin,puertas").eq("activo", true)
    ]);
    if (estudiantesResult.error) throw estudiantesResult.error;
    if (eventosResult.error) throw eventosResult.error;
    if (asignacionesResult.error) throw asignacionesResult.error;
    if (configuracionResult.error) throw configuracionResult.error;

    const normalizarPuerta = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^door\s+/, "").replace(/[^a-z0-9]/g, "");
    const configs = configuracionResult.data || [];
    const configPorNivel = new Map(configs.map(x => [String(x.nivel_acceso || "").trim().toLowerCase(), x]));
    const asignacionesPorEstudiante = new Map();
    (asignacionesResult.data || []).forEach(row => {
      const nivel = row.niveles_acceso_hikcentral || {};
      const config = configPorNivel.get(String(nivel.nombre || "").trim().toLowerCase());
      const lista = asignacionesPorEstudiante.get(row.estudiante_id) || [];
      lista.push({
        nombre: nivel.nombre || "Nivel sin nombre",
        horaExacta: nivel.hora_salida || null,
        plantilla: nivel.time_schedule_name || "",
        inicio: config?.hora_inicio || null,
        fin: config?.hora_fin || null,
        puertas: config?.puertas || []
      });
      asignacionesPorEstudiante.set(row.estudiante_id, lista);
    });
    const eventosPorEstudiante = new Map();
    (eventosResult.data || []).forEach(evento => {
      if (!evento.estudiante_id) return;
      const lista = eventosPorEstudiante.get(evento.estudiante_id) || [];
      lista.push(evento);
      eventosPorEstudiante.set(evento.estudiante_id, lista);
    });
    const ahoraLocal = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const fechaHoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const resumen = (estudiantesResult.data || []).map(estudiante => {
      const niveles = asignacionesPorEstudiante.get(estudiante.id) || [];
      const eventos = eventosPorEstudiante.get(estudiante.id) || [];
      const reglas = niveles.map(n => ({ ...n, puertasNormalizadas: n.puertas.map(normalizarPuerta) })).filter(n => n.inicio && n.fin);
      const eventosSalida = eventos.filter(evento => {
        const puerta = normalizarPuerta(evento.puerta_nombre || evento.puerta_codigo);
        if (!puerta) return false;
        const reglasConPuerta = reglas.filter(regla => regla.puertasNormalizadas.some(p => p && (puerta.includes(p) || p.includes(puerta))));
        return reglasConPuerta.length > 0;
      });
      const eventoSalida = eventosSalida[0] || null;
      const horaReal = eventoSalida ? new Intl.DateTimeFormat("en-GB", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(eventoSalida.fecha_evento)) : null;
      let estado = "Pendiente de salida";
      if (!niveles.length) estado = "Nivel de acceso no sincronizado";
      else if (!reglas.length) estado = "Horario por verificar";
      else if (eventoSalida) {
        const minutos = horaReal ? Number(horaReal.slice(0, 2)) * 60 + Number(horaReal.slice(3, 5)) : null;
        const dentroHorario = reglas.some(regla => {
          if (minutos === null) return false;
          const ini = Number(String(regla.inicio).slice(0, 2)) * 60 + Number(String(regla.inicio).slice(3, 5));
          const finMin = Number(String(regla.fin).slice(0, 2)) * 60 + Number(String(regla.fin).slice(3, 5));
          return minutos >= ini && minutos <= finMin;
        });
        const minInicio = Math.min(...reglas.map(regla => Number(String(regla.inicio).slice(0, 2)) * 60 + Number(String(regla.inicio).slice(3, 5))));
        const minFin = Math.max(...reglas.map(regla => Number(String(regla.fin).slice(0, 2)) * 60 + Number(String(regla.fin).slice(3, 5))));
        estado = dentroHorario ? "Salida registrada en horario" : minutos < minInicio ? "Salida anticipada" : "Salida fuera del horario";
      } else if (fecha !== fechaHoy) {
        estado = "Sin evento de salida registrado";
      } else {
        const minAhora = Number(ahoraLocal.slice(0, 2)) * 60 + Number(ahoraLocal.slice(3, 5));
        const finReglas = Math.max(...reglas.map(regla => Number(String(regla.fin).slice(0, 2)) * 60 + Number(String(regla.fin).slice(3, 5))));
        estado = minAhora > finReglas ? "Sin evento de salida registrado" : "Pendiente de salida";
      }
      return {
        estudiante_id: estudiante.id,
        codigo: estudiante.codigo || "",
        codigo_hik: estudiante.codigo_hik || "",
        estudiante: [estudiante.apellidos, estudiante.nombres].filter(Boolean).join(" ").trim(),
        curso: estudiante.curso || "",
        paralelo: estudiante.paralelo || "",
        niveles: niveles.map(n => n.nombre),
        horarios_hikcentral: niveles.map(n => n.plantilla).filter(Boolean),
        hora_esperada: niveles.map(n => n.horaExacta).filter(Boolean).join(", ") || reglas.map(n => String(n.inicio).slice(0,5) + "–" + String(n.fin).slice(0,5)).join(", "),
        hora_real_salida: horaReal,
        puerta_salida: eventoSalida?.puerta_nombre || eventoSalida?.puerta_codigo || "",
        estado,
        eventos_del_dia: eventos.length
      };
    });
    return res.json({
      ok: true, fecha, totalEstudiantes: resumen.length,
      conSalida: resumen.filter(r => r.hora_real_salida).length,
      sinNivel: resumen.filter(r => r.estado === "Nivel de acceso no sincronizado").length,
      novedades: resumen.filter(r => ["Salida anticipada", "Salida fuera del horario", "Sin evento de salida registrado", "Horario por verificar"].includes(r.estado)).length,
      data: resumen
    });
  } catch (error) {
    console.error("Error generando resumen diario de salidas:", error.message);
    return res.status(500).json({ ok: false, message: error.message || "No se pudo generar el resumen diario." });
  }
});

router.get("/dashboard-historial", async (req, res) => {
  try {
    const hoy = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());
    const fechaHasta = String(req.query.hasta || hoy).trim();
    const fechaDesde = String(req.query.desde || "").trim() || (() => {
      const d = new Date(fechaHasta + "T12:00:00-05:00");
      d.setDate(d.getDate() - 29);
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(d);
    })();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta) || fechaDesde > fechaHasta) {
      return res.status(400).json({ ok: false, message: "Selecciona un rango de fechas válido." });
    }
    const { data, error } = await supabase
      .from("historial_diario_hikcentral")
      .select("fecha_snapshot,total_niveles,total_asignaciones,total_horarios,niveles_acceso,asignaciones_estudiantes,referencias_horario,configuracion_salidas,sincronizado_en")
      .gte("fecha_snapshot", fechaDesde)
      .lte("fecha_snapshot", fechaHasta)
      .order("fecha_snapshot", { ascending: false });
    if (error) throw error;
    const filas = data || [];
    const porFecha = new Map(filas.map(f => [f.fecha_snapshot, f]));
    const resultado = filas.map(f => {
      const anteriorFecha = new Date(f.fecha_snapshot + "T12:00:00-05:00");
      anteriorFecha.setDate(anteriorFecha.getDate() - 1);
      const anteriorClave = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(anteriorFecha);
      const anterior = porFecha.get(anteriorClave);
      const detalleNiveles = (f.niveles_acceso || []).map(n => ({
        id: n.privilege_group_id, nombre: n.nombre, descripcion: n.descripcion,
        hora_salida: n.hora_salida, horario: n.time_schedule_name
      }));
      const resumenAsignaciones = (f.asignaciones_estudiantes || []).map(a => ({
        estudiante_id: a.estudiante_id, nivel_id: a.privilege_group_id,
        persona_hik: a.person_id_hik
      }));
      return {
        fecha: f.fecha_snapshot,
        sincronizado_en: f.sincronizado_en,
        total_niveles: f.total_niveles || 0,
        total_asignaciones: f.total_asignaciones || 0,
        total_horarios: f.total_horarios || 0,
        total_reglas: Array.isArray(f.configuracion_salidas) ? f.configuracion_salidas.length : 0,
        variacion_niveles: anterior ? (f.total_niveles || 0) - (anterior.total_niveles || 0) : null,
        variacion_asignaciones: anterior ? (f.total_asignaciones || 0) - (anterior.total_asignaciones || 0) : null,
        detalle_niveles: detalleNiveles,
        detalle_asignaciones: resumenAsignaciones,
        referencias_horario: f.referencias_horario || [],
        configuracion_salidas: f.configuracion_salidas || []
      };
    });
    return res.json({ ok: true, desde: fechaDesde, hasta: fechaHasta, total: resultado.length, data: resultado });
  } catch (error) {
    console.error("Error consultando histórico diario de HikCentral:", error.message);
    return res.status(500).json({ ok: false, message: error.message || "No se pudo consultar el histórico diario." });
  }
});

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