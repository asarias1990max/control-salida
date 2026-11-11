import { getUserByCredentials, getUserByGoogleId, createOrUpdateGoogleUser } from "../models/userModel.js";
import { crearSesion } from "../services/sessionService.js";

function usuarioPublico(usuario) {
  if (!usuario) return null;
  const { password, ...datos } = usuario;
  return datos;
}

export async function login(req, res) {

  const { user, pass } = req.body;

  const usuario = await getUserByCredentials(user, pass);

  if (!usuario) {
    return res.json({
      ok: false,
      message: "Credenciales incorrectas"
    });
  }

  const usuarioSeguro = usuarioPublico(usuario);
  crearSesion(res, usuarioSeguro);

  return res.json({
    ok: true,
    message: "Login correcto",
    user: usuarioSeguro
  });
}

/* =========================
   GOOGLE LOGIN
========================= */
export async function googleLogin(req, res) {
  try {
    const { credential } = req.body || {};
    if (!credential || !process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ ok: false, message: "No se pudo validar la cuenta de Google." });
    }

    // Validar la credencial directamente con Google; nunca confiar en el correo enviado por el navegador.
    const tokenInfoResponse = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!tokenInfoResponse.ok) {
      return res.status(401).json({ ok: false, message: "La sesión de Google no es válida. Intenta nuevamente." });
    }
    const claims = await tokenInfoResponse.json();
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.email_verified !== "true" || !claims.email || !claims.sub || !claims.name) {
      return res.status(401).json({ ok: false, message: "No se pudo verificar tu cuenta institucional de Google." });
    }

    const google_id = claims.sub;
    const email = String(claims.email).trim().toLowerCase();
    const nombre = claims.name;
    const avatar = claims.picture || "";
    const esUsuarioDashboardSalidas = email === "fsaltos@einstein.k12.ec";

    console.log("Google login attempt:", { google_id, email, nombre });

    if (!email || !nombre) {
      return res.status(400).json({
        ok: false,
        message: "Datos incompletos de Google"
      });
    }

    // Crear o actualizar usuario de Google
    const usuario = await createOrUpdateGoogleUser({
      google_id,
      email,
      nombre,
      avatar
    });

    const usuarioSeguro = usuarioPublico(usuario);
    if (esUsuarioDashboardSalidas) {
      usuarioSeguro.rol = "dashboard_salidas";
      usuarioSeguro.permisos_menu = ["dashboard_salidas"];
    }
    crearSesion(res, usuarioSeguro);

    return res.json({
      ok: true,
      message: "Login con Google correcto",
      user: usuarioSeguro
    });

  } catch (error) {
    console.error("Error en login con Google:", error);

    return res.status(500).json({
      ok: false,
      message: "Error interno del servidor: " + error.message
    });
  }
}

/* =========================
   GOOGLE CONFIG
========================= */
export async function getGoogleConfig(req, res) {
  return res.json({
    ok: true,
    clientId: process.env.GOOGLE_CLIENT_ID || ''
  });
}