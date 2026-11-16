import express from "express";
import { listarUsuarios, crearUsuario, actualizarUsuario, cambiarEstadoUsuario, generarEnlaceActivacion } from "../controllers/usuariosController.js";

const router = express.Router();
router.get("/", listarUsuarios);
router.post("/", crearUsuario);
router.put("/:id", actualizarUsuario);
router.post("/:id/enlace-activacion", generarEnlaceActivacion);
router.patch("/:id/estado", cambiarEstadoUsuario);
export default router;
