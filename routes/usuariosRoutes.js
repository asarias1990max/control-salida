import express from "express";
import { listarUsuarios, crearUsuario, actualizarUsuario, cambiarEstadoUsuario } from "../controllers/usuariosController.js";

const router = express.Router();
router.get("/", listarUsuarios);
router.post("/", crearUsuario);
router.put("/:id", actualizarUsuario);
router.patch("/:id/estado", cambiarEstadoUsuario);
export default router;
