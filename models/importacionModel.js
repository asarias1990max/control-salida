import { supabase } from "../config/supabaseClient.js";

export async function registrarImportacion(datos) {
  const { data, error } = await supabase
    .from("importaciones")
    .insert({
      usuario_id: datos.usuario_id,
      archivo_nombre: datos.archivo_nombre,
      total_registros: datos.total_registros,
      registros_insertados: datos.registros_insertados,
      registros_actualizados: datos.registros_actualizados,
      registros_error: datos.registros_error,
      estado: datos.estado,
      detalle_error: datos.detalle_error
    })
    .select()
    .single();

  if (error) {
    console.error("Error registrando importación:", error.message);
    throw error;
  }

  return data;
}