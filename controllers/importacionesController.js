import { procesarCSVEstudiantes } from "../models/estudianteModel.js";
import { registrarImportacion } from "../models/importacionModel.js";

export async function importarEstudiantes(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "No se recibió ningún archivo CSV"
      });
    }

    const usuario_id = req.body.usuario_id || null;

    const resultado = await procesarCSVEstudiantes(req.file.buffer);

    await registrarImportacion({
      usuario_id,
      archivo_nombre: req.file.originalname,
      total_registros: resultado.total_registros,
      registros_insertados: resultado.registros_insertados,
      registros_actualizados: resultado.registros_actualizados,
      registros_error: resultado.registros_error,
      estado: "procesado",
      detalle_error: null
    });

    return res.json({
      ok: true,
      message: "Importación finalizada correctamente",
      resultado
    });

  } catch (error) {
    console.error("Error importando estudiantes:", error);

    return res.status(500).json({
      ok: false,
      message: "Error al importar estudiantes",
      error: error.message
    });
  }
}