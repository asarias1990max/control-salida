import { supabase } from "../config/supabaseClient.js";

export async function obtenerEstudiantePorId(estudiante_id) {
  const { data, error } = await supabase
    .from("estudiantes")
    .select("id, codigo, codigo_hik, apellidos, nombres, curso, paralelo")
    .eq("id", estudiante_id)
    .single();

  if (error) throw error;

  return data;
}

export async function registrarSalidaBD({
  estudiante_id,
  usuario_id,
  tipo_salida,
  fecha,
  hora,
  motivo,
  nivel,
  estado_hik
}) {
  const { data, error } = await supabase
    .from("salidas")
    .insert({
      estudiante_id,
      usuario_id,
      tipo_salida,
      fecha,
      hora,
      motivo,
      nivel,
      estado_hik
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function registrarLogHik({
  salida_id,
  estado,
  mensaje
}) {
  const { error } = await supabase
    .from("logs_hik")
    .insert({
      salida_id,
      estado,
      mensaje
    });

  if (error) throw error;
}

/* =========================
   SALIDAS HOY
========================= */
export async function getSalidasHoy() {
  const hoy = new Date().toISOString().split('T')[0];

  const { count, error } = await supabase
    .from("salidas")
    .select("*", { count: "exact", head: true })
    .eq("fecha", hoy);

  if (error) {
    throw error;
  }

  return count;
}

/* =========================
   PENDIENTES
========================= */
export async function getPendientes() {
  const { count, error } = await supabase
    .from("salidas")
    .select("*", { count: "exact", head: true })
    .eq("estado_hik", "pendiente");

  if (error) {
    throw error;
  }

  return count;
}

/* =========================
   ACTIVIDAD RECIENTE
========================= */
export async function getActividadReciente(limit = 10) {
  const { data, error } = await supabase
    .from("salidas")
    .select(`
      id,
      tipo_salida,
      fecha,
      hora,
      estudiantes (
        apellidos,
        nombres
      )
    `)
    .order("fecha", { ascending: false })
    .order("hora", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data.map(item => ({
    estudiante: `${item.estudiantes.apellidos} ${item.estudiantes.nombres}`,
    tipo: item.tipo_salida,
    hora: item.hora,
    fecha: item.fecha
  }));
}