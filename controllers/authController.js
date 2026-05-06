import { getUserByCredentials } from "../models/userModel.js";

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