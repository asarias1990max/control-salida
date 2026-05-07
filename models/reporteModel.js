import { supabase } from "../config/supabaseClient.js";

export async function getReporteSalidasPorFechas(desde, hasta) {
  const { data, error } = await supabase
    .from("salidas")
    .select(`
      id,
      tipo_salida,
      fecha,
      hora,
      motivo,
      nivel,
      estado_hik,
      created_at,
      estudiantes (
        codigo,
        codigo_hik,
        apellidos,
        nombres,
        curso,
        paralelo
      ),
      usuarios (
        nombre,
        email
      )
    `)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}