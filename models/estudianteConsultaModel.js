import { supabase } from "../config/supabaseClient.js";

/* =========================
   CURSOS PERMITIDOS LOWER
========================= */
const CURSOS_LOWER = [
  "Kindergarten (1 EGB)",
  "Grade 5 (6 EGB)",
  "PreK 2 (Inicial 2)",
  "PreK 1 (Inicial 1)",
  "Grade 4 (5 EGB)",
  "Grade 3 (4 EGB)",
  "Grade 1 (2 EGB)",
  "Grade 2 (3 EGB)"
];

/* =========================
   CURSOS PERMITIDOS MIDDLE
========================= */
const CURSOS_MIDDLE = [
  "Grade 6 (7 EGB)",
  "Grade 7 (8 EGB)",
  "Grade 8 (9 EGB)"
];

/* =========================
   CURSOS PERMITIDOS HIGH
========================= */
const CURSOS_HIGH = [
  "Grade 10 (1 BGU)",
  "Grade 11 (2 BGU)",
  "Grade 12 (3 BGU)"
];

/* =========================
   CURSOS LOWER
========================= */
export async function getCursosLower() {
  return CURSOS_LOWER;
}

/* =========================
   CURSOS MIDDLE
========================= */
export async function getCursosMiddle() {
  return CURSOS_MIDDLE;
}

/* =========================
   CURSOS HIGH
========================= */
export async function getCursosHigh() {
  return CURSOS_HIGH;
}

/* =========================
   PARALELOS POR CURSO
========================= */
export async function getParalelosPorCurso(curso) {
  const { data, error } = await supabase
    .from("estudiantes")
    .select("paralelo")
    .eq("curso", curso)
    .eq("estado", true)
    .order("paralelo", { ascending: true });

  if (error) {
    throw error;
  }

  const paralelosUnicos = [...new Set(data.map(item => item.paralelo))];

  return paralelosUnicos;
}

/* =========================
   ESTUDIANTES POR CURSO/PARALELO
========================= */
export async function getEstudiantesPorCursoParalelo(curso, paralelo) {
  let query = supabase
    .from("estudiantes")
    .select("id, codigo, codigo_hik, apellidos, nombres, seccion, curso, paralelo")
    .eq("curso", curso)
    .eq("estado", true)
    .order("apellidos", { ascending: true });

  if (paralelo) {
    query = query.eq("paralelo", paralelo);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data;
}

/* =========================
   TOTAL ESTUDIANTES
========================= */
export async function getTotalEstudiantes() {
  const { count, error } = await supabase
    .from("estudiantes")
    .select("*", { count: "exact", head: true })
    .eq("estado", true);

  if (error) {
    throw error;
  }

  return count;
}