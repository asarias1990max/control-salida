import express from "express";
import {
  obtenerCursosLower,
  obtenerCursosMiddle,
  obtenerCursosHigh,
  obtenerParalelosPorCurso,
  obtenerEstudiantesPorCursoParalelo,
  obtenerTotalEstudiantes
} from "../controllers/estudiantesController.js";

const router = express.Router();

router.get("/lower/cursos", obtenerCursosLower);
router.get("/middle/cursos", obtenerCursosMiddle);
router.get("/high/cursos", obtenerCursosHigh);
router.get("/paralelos", obtenerParalelosPorCurso);
router.get("/", obtenerEstudiantesPorCursoParalelo);
router.get("/total", obtenerTotalEstudiantes);

export default router;