import {
  getCursosLower,
  getCursosMiddle,
  getCursosHigh,
  getParalelosPorCurso,
  getEstudiantesPorCursoParalelo,
  getTotalEstudiantes
} from "../models/estudianteConsultaModel.js";

/* =========================
   CURSOS LOWER
========================= */
export async function obtenerCursosLower(req, res) {
  try {
    const cursos = await getCursosLower();

    return res.json({
      ok: true,
      data: cursos
    });

  } catch (error) {
    console.error("Error obteniendo cursos Lower:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo cursos Lower"
    });
  }
}

/* =========================
   CURSOS MIDDLE
========================= */
export async function obtenerCursosMiddle(req, res) {
  try {
    const cursos = await getCursosMiddle();

    return res.json({
      ok: true,
      data: cursos
    });

  } catch (error) {
    console.error("Error obteniendo cursos Middle:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo cursos Middle"
    });
  }
}

/* =========================
   CURSOS HIGH
========================= */
export async function obtenerCursosHigh(req, res) {
  try {
    const cursos = await getCursosHigh();

    return res.json({
      ok: true,
      data: cursos
    });

  } catch (error) {
    console.error("Error obteniendo cursos High:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo cursos High"
    });
  }
}

/* =========================
   PARALELOS POR CURSO
========================= */
export async function obtenerParalelosPorCurso(req, res) {
  try {
    const { curso } = req.query;

    if (!curso) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar el curso"
      });
    }

    const paralelos = await getParalelosPorCurso(curso);

    return res.json({
      ok: true,
      data: paralelos
    });

  } catch (error) {
    console.error("Error obteniendo paralelos:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo paralelos"
    });
  }
}

/* =========================
   ESTUDIANTES POR CURSO/PARALELO
========================= */
export async function obtenerEstudiantesPorCursoParalelo(req, res) {
  try {
    const { curso, paralelo } = req.query;

    if (!curso) {
      return res.status(400).json({
        ok: false,
        message: "Debe enviar curso"
      });
    }

    const estudiantes = await getEstudiantesPorCursoParalelo(curso, paralelo);

    return res.json({
      ok: true,
      data: estudiantes
    });

  } catch (error) {
    console.error("Error obteniendo estudiantes:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo estudiantes"
    });
  }
}

/* =========================
   TOTAL ESTUDIANTES
========================= */
export async function obtenerTotalEstudiantes(req, res) {
  try {
    const total = await getTotalEstudiantes();

    return res.json({
      ok: true,
      data: total
    });

  } catch (error) {
    console.error("Error obteniendo total estudiantes:", error);

    return res.status(500).json({
      ok: false,
      message: "Error obteniendo total estudiantes"
    });
  }
}