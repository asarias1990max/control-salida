import crypto from "crypto";

// Sesiones de proceso con expiración deslizante. El identificador nunca se guarda
// en localStorage: viaja únicamente en una cookie HttpOnly.
const DURACION_INACTIVIDAD_MS = 15 * 60 * 1000;
const NOMBRE_COOKIE = "control_salida_sid";
const sesiones = new Map();

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

export function crearSesion(res, usuario) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const ahora = Date.now();

  sesiones.set(tokenHash, {
    usuario,
    creadaEn: ahora,
    ultimaActividad: ahora
  });

  configurarCookie(res, token);
}

export function obtenerSesion(req) {
  const token = leerToken(req);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const sesion = sesiones.get(tokenHash);
  if (!sesion) return null;

  if (Date.now() - sesion.ultimaActividad >= DURACION_INACTIVIDAD_MS) {
    sesiones.delete(tokenHash);
    return null;
  }

  return { tokenHash, sesion };
}

export function exigirSesion(req, res, next) {
  const resultado = obtenerSesion(req);
  if (!resultado) {
    limpiarCookieSesion(res);
    return res.status(401).json({
      ok: false,
      code: "SESSION_EXPIRED",
      message: "Tu sesión expiró. Inicia sesión nuevamente."
    });
  }

  resultado.sesion.ultimaActividad = Date.now();
  configurarCookie(res, leerToken(req));
  req.usuarioSesion = resultado.sesion.usuario;
  next();
}

export function renovarSesionActual(req, res) {
  const resultado = obtenerSesion(req);
  if (!resultado) {
    limpiarCookieSesion(res);
    return null;
  }

  resultado.sesion.ultimaActividad = Date.now();
  configurarCookie(res, leerToken(req));
  return resultado.sesion.usuario;
}

export function cerrarSesion(req, res) {
  const token = leerToken(req);
  if (token) sesiones.delete(hashToken(token));
  limpiarCookieSesion(res);
}
