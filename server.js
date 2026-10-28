import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import importacionesRoutes from "./routes/importacionesRoutes.js";
import estudiantesRoutes from "./routes/estudiantesRoutes.js";
import salidasRoutes from "./routes/salidasRoutes.js";
import { obtenerDashboardEventosHik, sincronizarNivelesYAsignacionesHik } from "./services/hikCentralService.js";
// import reportesRoutes from "./routes/reportesRoutes.js";

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
// app.use("/api/reportes", reportesRoutes);

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
  iniciarSincronizacionAutomaticaHik();
});

function fechaHoraGuayaquil() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const valor = (tipo) => partes.find(p => p.type === tipo)?.value || "";
  return {
    fecha: valor("year") + "-" + valor("month") + "-" + valor("day"),
    hora: Number(valor("hour")),
    minuto: Number(valor("minute"))
  };
}

function iniciarSincronizacionAutomaticaHik() {
  if (!process.env.HIK_BASE_URL || !process.env.HIK_APP_KEY || !process.env.HIK_APP_SECRET) {
    console.warn("[HikCentral] Sincronización automática desactivada: faltan variables HIK_*.");
    return;
  }

  let ultimaFechaNiveles = "";
  let sincronizacionEnCurso = false;

  const ejecutar = async () => {
    if (sincronizacionEnCurso) {
      console.log("[HikCentral] Se omite ciclo automático porque el anterior sigue ejecutándose.");
      return;
    }
    const ahora = fechaHoraGuayaquil();
    if (ahora.hora < 6 || ahora.hora >= 20) return;
    sincronizacionEnCurso = true;
    try {
      console.log("[HikCentral] Inicio de sincronización automática para", ahora.fecha);
      const eventos = await obtenerDashboardEventosHik(ahora.fecha, ahora.fecha, []);
      console.log("[HikCentral] Sincronización automática de eventos completada:", JSON.stringify({
        fecha: ahora.fecha, eventosConsultados: eventos.totalEventos, eventosGuardados: eventos.eventosGuardados || 0
      }));

      if (ultimaFechaNiveles !== ahora.fecha) {
        const niveles = await sincronizarNivelesYAsignacionesHik();
        ultimaFechaNiveles = ahora.fecha;
        console.log("[HikCentral] Sincronización diaria de niveles completada:", JSON.stringify(niveles));
      }
    } catch (error) {
      console.error("[HikCentral] Falló la sincronización automática; se reintentará en el siguiente ciclo:", error.message);
    } finally {
      sincronizacionEnCurso = false;
    }
  };

  // Primer ciclo tras arrancar el servidor y repetición cada 15 minutos durante la jornada.
  setTimeout(ejecutar, 20000);
  setInterval(ejecutar, 15 * 60 * 1000);
}
