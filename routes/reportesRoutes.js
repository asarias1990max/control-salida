import express from "express";
import { obtenerReporteSalidas } from "../controllers/reportesController.js";

const router = express.Router();

router.get("/salidas", obtenerReporteSalidas);

export default router;