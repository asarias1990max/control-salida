import express from "express";
import multer from "multer";
import { importarEstudiantes } from "../controllers/importacionesController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage()
});

router.post("/estudiantes", upload.single("archivo"), importarEstudiantes);

export default router;