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

    const normalizar = valor => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^door\s+/, "").replace(/[^a-z0-9]/g, "");
    const resultadoConcedido = evento => {
      const texto = normalizar([evento.resultado, evento.datos_originales?.attendanceStatus, evento.datos_originales?.eventStatus, evento.datos_originales?.status, evento.datos_originales?.result, evento.datos_originales?.checkResult].filter(Boolean).join(" "));
      if (/error|denegad|denied|failed|failure|invalid|noautoriz|rechaz|forbidden|notgranted/.test(texto)) return false;
      return /concedid|granted|success|successful|permitid|authorized|autorizad|allow|normal/.test(texto);
    };
    // Convención de puertas del colegio: CE = entrada y CS = salida.
    const esEntrada = evento => /^(ce|entrada|entry|ingreso)/.test(normalizar(evento.puerta_nombre || evento.puerta_codigo));
    const esSalida = evento => /^(cs|salida|exit|egreso)/.test(normalizar(evento.puerta_nombre || evento.puerta_codigo));
    const configs = configuracionResult.data || [];
    const configPorNivel = new Map(configs.map(x => [String(x.nivel_acceso || "").trim().toLowerCase(), x]));
    const asignacionesPorEstudiante = new Map();
    (asignacionesResult.data || []).forEach(row => {
      const nivel = row.niveles_acceso_hikcentral || {};
      const config = configPorNivel.get(String(nivel.nombre || "").trim().toLowerCase());
      const lista = asignacionesPorEstudiante.get(row.estudiante_id) || [];
      lista.push({ nombre: nivel.nombre || "Nivel sin nombre", horaExacta: nivel.hora_salida || null, plantilla: nivel.time_schedule_name || "", inicio: config?.hora_inicio || null, fin: config?.hora_fin || null, puertas: config?.puertas || [] });
      asignacionesPorEstudiante.set(row.estudiante_id, lista);
    });
    const eventosPorEstudiante = new Map();
    (eventosResult.data || []).forEach(evento => {
      if (!evento.estudiante_id) return;
      const lista = eventosPorEstudiante.get(evento.estudiante_id) || [];
      lista.push(evento);
      eventosPorEstudiante.set(evento.estudiante_id, lista);
    });
    const horaLocal = valor => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Guayaquil", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(valor));
    const eventosSincronizados = eventosResult.data || [];
    const hayEventosSincronizados = eventosSincronizados.length > 0;
    const resumen = (estudiantesResult.data || []).map(estudiante => {
      const niveles = asignacionesPorEstudiante.get(estudiante.id) || [];
      const eventos = eventosPorEstudiante.get(estudiante.id) || [];
      const entradas = eventos.filter(esEntrada);
      const salidas = eventos.filter(esSalida);
      const entradasConcedidas = entradas.filter(resultadoConcedido);
      const salidasConcedidas = salidas.filter(resultadoConcedido);
      const entradasError = entradas.filter(e => !resultadoConcedido(e));
      const salidasError = salidas.filter(e => !resultadoConcedido(e));
      const puertasPermitidas = niveles.flatMap(n => n.puertas || []).map(normalizar).filter(Boolean);
      const salidasConcedidasPuertaIncorrecta = salidasConcedidas.filter(e => {
        const puerta = normalizar(e.puerta_nombre || e.puerta_codigo);
        return puertasPermitidas.length > 0 && !puertasPermitidas.some(p => puerta.includes(p) || p.includes(puerta));
      });
      const reglas = niveles.filter(n => n.inicio && n.fin);
      const salidasFueraHorario = salidasConcedidas.filter(e => {
        const h = horaLocal(e.fecha_evento);
        const minutos = Number(h.slice(0,2))*60 + Number(h.slice(3,5));
        return reglas.length > 0 && !reglas.some(r => {
          const ini = Number(String(r.inicio).slice(0,2))*60 + Number(String(r.inicio).slice(3,5));
          const finM = Number(String(r.fin).slice(0,2))*60 + Number(String(r.fin).slice(3,5));
          return minutos >= ini && minutos <= finM;
        });
      });
      const primeraEntrada = entradasConcedidas[0] || entradas[0] || null;
      const primeraSalida = salidasConcedidas[0] || salidas[0] || null;
      const flags = {
        entrada_concedida: entradasConcedidas.length > 0,
        salida_concedida: salidasConcedidas.length > 0,
        entrada_y_salida: entradasConcedidas.length > 0 && salidasConcedidas.length > 0,
        // No marcar a todos como ausentes si la sincronización aún no ha cargado eventos.
        ausente: hayEventosSincronizados && entradas.length === 0 && salidas.length === 0,
        error_entrada: entradasError.length > 0,
        error_salida: salidasError.length > 0,
        fuera_horario: salidasFueraHorario.length > 0,
        entrada_sin_salida: entradasConcedidas.length > 0 && salidasConcedidas.length === 0,
        salida_sin_entrada: salidasConcedidas.length > 0 && entradasConcedidas.length === 0,
        puerta_equivocada: salidasConcedidasPuertaIncorrecta.length > 0
      };
      return {
        estudiante_id: estudiante.id, codigo: estudiante.codigo || "", codigo_hik: estudiante.codigo_hik || "",
        apellidos: estudiante.apellidos || "", nombres: estudiante.nombres || "",
        estudiante: [estudiante.apellidos, estudiante.nombres].filter(Boolean).join(" ").trim(),
        seccion: estudiante.seccion || "", curso: estudiante.curso || "", paralelo: estudiante.paralelo || "",
        niveles: niveles.map(n => n.nombre),
        configuracion: {
          horario: niveles.map(n => n.inicio && n.fin ? String(n.inicio).slice(0,5) + "–" + String(n.fin).slice(0,5) : "").filter(Boolean).join(", "),
          puertas: [...new Set(niveles.flatMap(n => n.puertas || []).map(p => typeof p === "string" ? p : (p.nombre || p.name || p.doorName || p.doorIndexCode || "")).filter(Boolean))].join(", ")
        },
        hora_entrada: primeraEntrada ? horaLocal(primeraEntrada.fecha_evento) : null,
        puerta_entrada: primeraEntrada?.puerta_nombre || primeraEntrada?.puerta_codigo || "",
        resultado_entrada: primeraEntrada ? primeraEntrada.resultado || "" : "",
        hora_salida: primeraSalida ? horaLocal(primeraSalida.fecha_evento) : null,
        puerta_salida: primeraSalida?.puerta_nombre || primeraSalida?.puerta_codigo || "",
        resultado_salida: primeraSalida ? primeraSalida.resultado || "" : "",
        eventos_entrada: entradas.length, eventos_salida: salidas.length, flags
      };
    });
    const indicadoresDef = [
      ["entrada_concedida", "Con registro de entrada concedida"],
      ["salida_concedida", "Con registro de salida concedida"],
      ["entrada_y_salida", "Con entrada y salida"],
      ["ausente", "Ausentes (sin entrada ni salida)"],
      ["error_entrada", "Con error a la entrada"],
      ["error_salida", "Con error a la salida"],
      ["fuera_horario", "Salieron fuera de horario permitido"],
      ["entrada_sin_salida", "Con entrada y sin salida"],
      ["salida_sin_entrada", "Con salida y sin entrada"],
      ["puerta_equivocada", "Salieron por puerta equivocada"]
    ];
    const total = resumen.length;
    const indicadores = indicadoresDef.map(([key, label]) => {
      const estudiantes = resumen.filter(r => r.flags[key]).length;
      return { key, indicador: label, estudiantes, total, porcentaje: total ? Number((estudiantes * 100 / total).toFixed(2)) : 0 };
    });
    return res.json({
      ok: true,
      fecha,
      totalEstudiantes: total,
      indicadores,
      data: resumen,
      fuentes: {
        estudiantes: total,
        eventosHikCentral: eventosSincronizados.length,
        asignacionesAcceso: (asignacionesResult.data || []).length,
        reglasSalida: configs.length,
        eventosDisponibles: hayEventosSincronizados
      },
      advertencias: [
        ...(!hayEventosSincronizados ? ["No hay eventos de HikCentral sincronizados para esta fecha. Los indicadores de entrada, salida y ausencia no deben interpretarse como resultados reales."] : []),
        ...(total === 0 ? ["No hay estudiantes activos en Supabase."] : [])
      ]
    });
  } catch (error) {
    console.error("Error generando resumen diario de entradas y salidas:", error.message);
    return res.status(500).json({ ok: false, message: error.message || "No se pudo generar el control diario." });
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
        apellidos: estudiante.apellidos || "",
        nombres: estudiante.nombres || "",
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