import { getUserByCredentials, getUserByGoogleId, createOrUpdateGoogleUser } from "../models/userModel.js";

export async function login(req, res) {

  const { user, pass } = req.body;

  const usuario = await getUserByCredentials(user, pass);

  if (!usuario) {
    return res.json({
      ok: false,
      message: "Credenciales incorrectas"
    });
  }

  return res.json({
    ok: true,
    message: "Login correcto",
    user: usuario
  });
}

/* =========================
   GOOGLE LOGIN
========================= */
export async function googleLogin(req, res) {
  try {
    const { google_id, email, nombre, avatar } = req.body;

    console.log('Google login attempt:', { google_id, email, nombre });

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

    console.log('User created/updated:', usuario);

    return res.json({
      ok: true,
      message: "Login con Google correcto",
      user: usuario
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