import { getReporteSalidasPorFechas } from "../models/reporteModel.js";

export async function obtenerReporteSalidas(req, res) {
  try {
    const { desde, hasta } = req.query;

    if (!desde || !hasta) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar fecha desde y fecha hasta"
      });
    }

    const data = await getReporteSalidasPorFechas(desde, hasta);

    return res.json({
      ok: true,
      data
    });

  } catch (error) {
    console.error("Error obteniendo reporte de salidas:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo reporte de salidas"
    });
  }
}