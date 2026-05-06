import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import importacionesRoutes from "./routes/importacionesRoutes.js";
import estudiantesRoutes from "./routes/estudiantesRoutes.js";
import salidasRoutes from "./routes/salidasRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   RUTAS BASE
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   ARCHIVOS ESTÁTICOS
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   RUTAS API
========================= */
app.use("/api", authRoutes);
app.use("/api/importaciones", importacionesRoutes);
app.use("/api/estudiantes", estudiantesRoutes);
app.use("/api/salidas", salidasRoutes);

/* =========================
   VISTAS (FRONTEND)
========================= */

// LOGIN
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// DASHBOARD
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

/* =========================
   404 - RUTA NO ENCONTRADA
========================= */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Ruta no encontrada"
  });
});

/* =========================
   MANEJO DE ERRORES GLOBAL
========================= */
app.use((err, req, res, next) => {
  console.error("ERROR:", err);

  res.status(500).json({
    ok: false,
    message: "Error interno del servidor"
  });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});