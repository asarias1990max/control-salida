import { supabase } from "../config/supabaseClient.js";

const PERMISOS_VALIDOS = ["salida_lower", "salida_middle", "salida_high", "importar_data", "reporte_salidas", "dashboard_salidas"];
const PERFILES = {
  admin: [...PERMISOS_VALIDOS, "usuarios"],
  dashboard_salidas: ["dashboard_salidas"],
  operador_salidas: ["salida_lower", "salida_middle", "salida_high"],
  personalizado: null
};

const normalizarEmail = value => String(value || "").trim().toLowerCase();
const limpiarUsuario = user => {
  if (!user) return user;
  const { password, google_id, ...safe } = user;
  return safe;
};

function validarDatos(body, crear = false) {
  const nombre = String(body.nombre || "").trim();
  const email = normalizarEmail(body.email);
  const rol = String(body.rol || "personalizado").trim();
  if (!nombre || nombre.length > 120) return { error: "Ingresa un nombre válido (máximo 120 caracteres)." };
  if (!/^[^\s@]+@einstein\.k12\.ec$/i.test(email)) return { error: "Solo se permiten correos institucionales @einstein.k12.ec." };
  if (!Object.hasOwn(PERFILES, rol)) return { error: "Selecciona un perfil válido." };
  const permisos = rol === "personalizado"
    ? [...new Set((Array.isArray(body.permisos_menu) ? body.permisos_menu : []).filter(p => PERMISOS_VALIDOS.includes(p)))]
    : [...PERFILES[rol]];
  if (rol === "personalizado" && permisos.length === 0) return { error: "Selecciona al menos un permiso para el perfil personalizado." };
  return { datos: { nombre, email, rol, permisos_menu: permisos } };
}

export async function listarUsuarios(req, res) {
  const { data, error } = await supabase.from("usuarios").select("id,nombre,email,rol,permisos_menu,estado,created_at").order("nombre");
  if (error) return res.status(500).json({ ok: false, message: "No se pudo cargar la lista de usuarios." });
  return res.json({ ok: true, data });
}

export async function crearUsuario(req, res) {
  const validacion = validarDatos(req.body || {}, true);
  if (validacion.error) return res.status(400).json({ ok: false, message: validacion.error });
  const { data: existente, error: errorBuscar } = await supabase.from("usuarios").select("id").eq("email", validacion.datos.email).maybeSingle();
  if (errorBuscar) return res.status(500).json({ ok: false, message: "No se pudo validar el correo." });
  if (existente) return res.status(409).json({ ok: false, message: "Ese correo ya está registrado." });
  const { data, error } = await supabase.from("usuarios").insert({
    ...validacion.datos,
    password: null,
    estado: "activo"
  }).select("id,nombre,email,rol,permisos_menu,estado,created_at").single();
  if (error) return res.status(500).json({ ok: false, message: "No se pudo registrar el usuario." });
  return res.status(201).json({ ok: true, data });
}

export async function actualizarUsuario(req, res) {
  const id = String(req.params.id || "");
  const validacion = validarDatos(req.body || {});
  if (validacion.error) return res.status(400).json({ ok: false, message: validacion.error });
  const { data: actual, error: errorActual } = await supabase.from("usuarios").select("id,email").eq("id", id).maybeSingle();
  if (errorActual || !actual) return res.status(404).json({ ok: false, message: "Usuario no encontrado." });
  if (actual.email.toLowerCase() === normalizarEmail(req.usuarioSesion?.email) && validacion.datos.rol !== "admin") {
    return res.status(400).json({ ok: false, message: "No puedes quitarte tu propio perfil de administrador." });
  }
  const { data, error } = await supabase.from("usuarios").update(validacion.datos).eq("id", id)
    .select("id,nombre,email,rol,permisos_menu,estado,created_at").single();
  if (error) return res.status(500).json({ ok: false, message: "No se pudo actualizar el usuario." });
  return res.json({ ok: true, data });
}

export async function cambiarEstadoUsuario(req, res) {
  const id = String(req.params.id || "");
  const estado = req.body?.estado === "activo" ? "activo" : req.body?.estado === "inactivo" ? "inactivo" : "";
  if (!estado) return res.status(400).json({ ok: false, message: "Estado no válido." });
  const { data: actual, error: errorActual } = await supabase.from("usuarios").select("id,email,rol").eq("id", id).maybeSingle();
  if (errorActual || !actual) return res.status(404).json({ ok: false, message: "Usuario no encontrado." });
  if (actual.email.toLowerCase() === normalizarEmail(req.usuarioSesion?.email) && estado === "inactivo") {
    return res.status(400).json({ ok: false, message: "No puedes desactivar tu propia cuenta." });
  }
  if (actual.rol === "admin" && estado === "inactivo") {
    const { count } = await supabase.from("usuarios").select("id", { count: "exact", head: true }).eq("rol", "admin").eq("estado", "activo");
    if ((count || 0) <= 1) return res.status(400).json({ ok: false, message: "Debe existir al menos un administrador activo." });
  }
  const { data, error } = await supabase.from("usuarios").update({ estado }).eq("id", id)
    .select("id,nombre,email,rol,permisos_menu,estado,created_at").single();
  if (error) return res.status(500).json({ ok: false, message: "No se pudo cambiar el estado." });
  return res.json({ ok: true, data });
}
