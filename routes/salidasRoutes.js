import express from "express";
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

export default router;