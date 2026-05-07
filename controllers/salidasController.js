import {
  obtenerEstudiantePorId,
  registrarSalidaBD,
  registrarLogHik,
  getSalidasHoy,
  getPendientes,
  getActividadReciente,
  getSalidasPorFecha
} from "../models/salidaModel.js";

import { asignarEstudianteNivelAcceso } from "../services/hikCentralService.js";

export async function registrarSalida(req, res) {
  try {
    const {
      estudiante_id,
      usuario_id,
      tipo_salida,
      fecha,
      hora,
      motivo,
      nivel
    } = req.body;

    if (!estudiante_id || !tipo_salida || !fecha || !hora || !nivel) {
      return res.status(400).json({
        ok: false,
        message: "Datos incompletos para registrar salida"
      });
    }

    const estudiante = await obtenerEstudiantePorId(estudiante_id);

    if (!estudiante || !estudiante.codigo_hik) {
      return res.status(400).json({
        ok: false,
        message: "El estudiante no tiene código HIK registrado"
      });
    }

    const privilegeGroupId = tipo_salida === "BUS" ? 66 : 65;

    const salida = await registrarSalidaBD({
      estudiante_id,
      usuario_id: usuario_id || null,
      tipo_salida,
      fecha,
      hora,
      motivo,
      nivel,
      estado_hik: "pendiente"
    });

    try {
      const respuestaHik = await asignarEstudianteNivelAcceso({
        privilegeGroupId,
        codigoHik: estudiante.codigo_hik
      });

      await registrarLogHik({
        salida_id: salida.id,
        estado: "ok",
        mensaje: JSON.stringify(respuestaHik)
      });

      return res.json({
        ok: true,
        message: "Salida registrada correctamente",
        data: salida
      });

    } catch (errorHik) {
      await registrarLogHik({
        salida_id: salida.id,
        estado: "error",
        mensaje: errorHik.message
      });

      return res.status(500).json({
        ok: false,
        message: "La salida se guardó, pero falló la asignación en HikCentral"
      });
    }

  } catch (error) {
    console.error("Error registrando salida:", error);

    return res.status(500).json({
      ok: false,
      message: "Error registrando salida"
    });
  }
}

/* =========================
   SALIDAS HOY
========================= */
export async function obtenerSalidasHoy(req, res) {
  try {
    const total = await getSalidasHoy();

    return res.json({
      ok: true,
      data: total
    });

  } catch (error) {
    console.error("Error obteniendo salidas hoy:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo salidas hoy"
    });
  }
}

/* =========================
   PENDIENTES
========================= */
export async function obtenerPendientes(req, res) {
  try {
    const total = await getPendientes();

    return res.json({
      ok: true,
      data: total
    });

  } catch (error) {
    console.error("Error obteniendo pendientes:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo pendientes"
    });
  }
}

/* =========================
   ACTIVIDAD RECIENTE
========================= */
export async function obtenerActividadReciente(req, res) {
  try {
    const actividad = await getActividadReciente();

    return res.json({
      ok: true,
      data: actividad
    });

  } catch (error) {
    console.error("Error obteniendo actividad reciente:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo actividad reciente"
    });
  }
}

/* =========================
   REPORTE SALIDAS POR FECHA
========================= */
export async function obtenerSalidasPorFecha(req, res) {
  try {
    const { fecha_inicio, fecha_fin } = req.query;

    if (!fecha_inicio || !fecha_fin) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar fecha_inicio y fecha_fin"
      });
    }

    const salidas = await getSalidasPorFecha(fecha_inicio, fecha_fin);

    return res.json({
      ok: true,
      data: salidas
    });

  } catch (error) {
    console.error("Error obteniendo salidas por fecha:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo salidas por fecha"
    });
  }
}