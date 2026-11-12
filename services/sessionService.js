import crypto from "crypto";
import { supabase } from "../config/supabaseClient.js";

// Las sesiones se guardan en Supabase para compartirlas entre instancias serverless de Vercel.
const DURACION_INACTIVIDAD_MS = 15 * 60 * 1000;
const NOMBRE_COOKIE = "control_salida_sid";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function leerToken(req) {
  const cookies = String(req.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const separador = cookie.indexOf("=");
    if (separador < 0) continue;
    const nombre = cookie.slice(0, separador).trim();
    if (nombre === NOMBRE_COOKIE) {
      try { return decodeURIComponent(cookie.slice(separador + 1).trim()); }
      catch { return ""; }
    }
  }
  return "";
}

function configurarCookie(res, token) {
  res.cookie(NOMBRE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_INACTIVIDAD_MS
  });
}

export function limpiarCookieSesion(res) {
  res.clearCookie(NOMBRE_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}

export async function crearSesion(res, usuario) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const ahora = new Date();
  const vence = new Date(ahora.getTime() + DURACION_INACTIVIDAD_MS);

  const { error } = await supabase.from("app_sessions").insert({
    token_hash: tokenHash,
    user_data: usuario,
    created_at: ahora.toISOString(),
    last_activity: ahora.toISOString(),
    expires_at: vence.toISOString()
  });
  if (error) {
    console.error("No se pudo guardar la sesión persistente:", error.message);
    throw new Error("No se pudo crear la sesión. Intenta nuevamente.");
  }

  configurarCookie(res, token);
}

export async function obtenerSesion(req) {
  const token = leerToken(req);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const { data, error } = await supabase
    .from("app_sessions")
    .select("user_data, expires_at")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("Error consultando la sesión persistente:", error.message);
    throw new Error("No se pudo validar la sesión.");
  }
  if (!data) return null;
  return { tokenHash, usuario: data.user_data };
}

export async function exigirSesion(req, res, next) {
  try {
    const resultado = await obtenerSesion(req);
    if (!resultado) {
      limpiarCookieSesion(res);
      return res.status(401).json({
        ok: false,
        code: "SESSION_EXPIRED",
        message: "Tu sesión expiró. Inicia sesión nuevamente."
      });
    }
    req.usuarioSesion = resultado.usuario;
    return next();
  } catch (error) {
    return res.status(503).json({ ok: false, code: "SESSION_STORE_UNAVAILABLE", message: "No se pudo validar la sesión. Intenta nuevamente." });
  }
}

// Solo la actividad explícita del navegador renueva los 15 minutos de inactividad.
export async function registrarActividad(req, res, next) {
  try {
    const token = leerToken(req);
    if (!token) {
      limpiarCookieSesion(res);
      return res.status(401).json({ ok: false, code: "SESSION_EXPIRED", message: "Tu sesión expiró. Inicia sesión nuevamente." });
    }

    const tokenHash = hashToken(token);
    const ahora = new Date();
    const vence = new Date(ahora.getTime() + DURACION_INACTIVIDAD_MS);
    const { data, error } = await supabase
      .from("app_sessions")
      .update({ last_activity: ahora.toISOString(), expires_at: vence.toISOString() })
      .eq("token_hash", tokenHash)
      .gt("expires_at", ahora.toISOString())
      .select("user_data")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      limpiarCookieSesion(res);
      return res.status(401).json({ ok: false, code: "SESSION_EXPIRED", message: "Tu sesión expiró. Inicia sesión nuevamente." });
    }

    configurarCookie(res, token);
    req.usuarioSesion = data.user_data;
    return next();
  } catch (error) {
    console.error("Error renovando la sesión persistente:", error.message);
    return res.status(503).json({ ok: false, code: "SESSION_STORE_UNAVAILABLE", message: "No se pudo renovar la sesión. Intenta nuevamente." });
  }
}

export async function renovarSesionActual(req, res) {
  const resultado = await obtenerSesion(req);
  if (!resultado) {
    limpiarCookieSesion(res);
    return null;
  }
  return resultado.usuario;
}

export async function cerrarSesion(req, res) {
  const token = leerToken(req);
  try {
    if (token) {
      const { error } = await supabase.from("app_sessions").delete().eq("token_hash", hashToken(token));
      if (error) throw error;
    }
  } finally {
    limpiarCookieSesion(res);
  }
}
