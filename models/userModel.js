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