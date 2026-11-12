import { getUserByCredentials, setUserPassword, createOrUpdateGoogleUser } from "../models/userModel.js";
import { crearSesion } from "../services/sessionService.js";
import { crearHashPassword, verificarPassword } from "../services/passwordService.js";

function usuarioPublico(usuario) {
  if (!usuario) return null;
  const { password, ...datos } = usuario;
  return datos;
}

export async function login(req, res) {
  try {
    const { user, pass } = req.body || {};
    if (typeof user !== "string" || typeof pass !== "string" || !user.trim() || !pass) {
      return res.status(400).json({ ok: false, message: "Ingresa tu correo y contraseña." });
    }

    const usuario = await getUserByCredentials(user);
    const passwordValida = usuario ? await verificarPassword(pass, usuario.password) : false;
    if (!usuario || !passwordValida) {
      return res.status(401).json({ ok: false, message: "Credenciales incorrectas o cuenta desactivada." });
    }

    if (String(usuario.email || "").trim().toLowerCase() === "fsaltos@einstein.k12.ec") {
      return res.status(403).json({ ok: false, message: "Esta cuenta debe ingresar exclusivamente con Google." });
    }

    const usuarioSeguro = usuarioPublico(usuario);
    await crearSesion(res, usuarioSeguro);
    return res.json({ ok: true, message: "Login correcto", user: usuarioSeguro });
  } catch (error) {
    console.error("Error en login tradicional:", error);
    return res.status(500).json({ ok: false, message: "No se pudo iniciar sesión. Intenta nuevamente." });
  }
}

export async function establecerPassword(req, res) {
  try {
    const usuarioSesion = req.usuarioSesion;
    const email = String(usuarioSesion?.email || "").trim().toLowerCase();
    if (email !== "asarias@einstein.k12.ec" || usuarioSesion?.rol !== "admin") {
      return res.status(403).json({ ok: false, message: "Solo el administrador principal puede configurar esta contraseña." });
    }

    const { password, confirmacion } = req.body || {};
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      return res.status(400).json({ ok: false, message: "La contraseña debe tener entre 12 y 128 caracteres." });
    }
    if (password !== confirmacion) {
      return res.status(400).json({ ok: false, message: "Las contraseñas no coinciden." });
    }

    const passwordHash = await crearHashPassword(password);
    await setUserPassword(usuarioSesion.id, passwordHash);
    return res.json({ ok: true, message: "Contraseña configurada correctamente. Ya puedes ingresar con correo y contraseña." });
  } catch (error) {
    console.error("Error configurando contraseña:", error);
    return res.status(500).json({ ok: false, message: "No se pudo configurar la contraseña." });
  }
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
    if (!email || !nombre) {
      return res.status(400).json({ ok: false, message: "Datos incompletos de Google" });
    }

    const usuario = await createOrUpdateGoogleUser({ google_id, email, nombre, avatar: claims.picture || "" });
    if (!usuario) {
      return res.status(403).json({ ok: false, message: "Tu correo institucional todavía no está autorizado para ingresar. Solicita acceso al administrador del sistema." });
    }

    const usuarioSeguro = usuarioPublico(usuario);
    await crearSesion(res, usuarioSeguro);
    return res.json({ ok: true, message: "Login con Google correcto", user: usuarioSeguro });
  } catch (error) {
    console.error("Error en login con Google:", error);
    return res.status(500).json({ ok: false, message: "Error interno del servidor." });
  }
}

export async function getGoogleConfig(req, res) {
  return res.json({ ok: true, clientId: process.env.GOOGLE_CLIENT_ID || "" });
}
