import { supabase } from "../config/supabaseClient.js";

export async function getUserByCredentials(email, password) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", String(email || "").trim().toLowerCase())
    .eq("password", password)
    .eq("estado", "activo")
    .single();
  if (error || !data) return null;
  return data;
}

export async function getUserByGoogleId(googleId) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("google_id", googleId)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Google no provisiona cuentas nuevas. El correo debe estar previamente
 * autorizado por un administrador y encontrarse activo en la tabla usuarios.
 */
export async function createOrUpdateGoogleUser(googleUser) {
  const email = String(googleUser.email || "").trim().toLowerCase();
  const { data: existingUser, error: searchError } = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (searchError) throw searchError;
  if (!existingUser || existingUser.estado !== "activo") return null;

  const cambios = { nombre: googleUser.nombre };
  if (googleUser.google_id && existingUser.google_id !== googleUser.google_id) {
    cambios.google_id = googleUser.google_id;
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update(cambios)
    .eq("id", existingUser.id)
    .eq("estado", "activo")
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
