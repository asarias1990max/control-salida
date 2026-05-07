import { supabase } from "../config/supabaseClient.js";

export async function getUserByCredentials(email, password) {

  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", email)
    .eq("password", password)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/* =========================
   GOOGLE AUTH
========================= */
export async function getUserByGoogleId(googleId) {
  const { data, error } = await supabase
    .from("usuarios")
    .select("*")
    .eq("google_id", googleId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function createOrUpdateGoogleUser(googleUser) {
  const { email, nombre } = googleUser;

  // Buscar usuario por email
  const { data: existingUser, error: searchError } = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", email)
    .single();

  if (existingUser && !searchError) {
    // Usuario existe, actualizar nombre si cambió
    const { error: updateError } = await supabase
      .from("usuarios")
      .update({
        nombre: nombre
      })
      .eq("id", existingUser.id);

    if (updateError) throw updateError;

    return existingUser;
  } else {
    // Crear nuevo usuario
    const defaultPermissions = ["salida_lower", "salida_middle", "salida_high", "importar_data", "reporte_salidas"];

    const newUser = {
      email: email,
      nombre: nombre,
      permisos_menu: defaultPermissions
    };

    const { data, error } = await supabase
      .from("usuarios")
      .insert(newUser)
      .select()
      .single();

    if (error) {
      // Fallback si el esquema no contiene columnas adicionales
      if (error.message.includes('estado') || error.message.includes('avatar') || error.message.includes('permisos_menu')) {
        const fallbackUser = {
          email: email,
          nombre: nombre
        };

        const { data: fallbackData, error: fallbackError } = await supabase
          .from("usuarios")
          .insert(fallbackUser)
          .select()
          .single();

        if (fallbackError) throw fallbackError;
        return fallbackData;
      }
      throw error;
    }

    return data;
  }
}