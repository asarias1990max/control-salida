import csv from "csv-parser";
import { Readable } from "stream";
import { supabase } from "../config/supabaseClient.js";

function normalizarTexto(valor) {
  return String(valor || "").trim();
}

function normalizarCodigo(valor) {
  return String(valor || "").trim();
}

function leerCSV(buffer) {
  return new Promise((resolve, reject) => {
    const registros = [];
    const stream = Readable.from(buffer.toString("utf8"));
    stream
      .pipe(csv({ mapHeaders: ({ header }) => String(header || "").replace(/^\\uFEFF/, "").trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toUpperCase() }))
      .on("data", row => registros.push(row))
      .on("end", () => resolve(registros))
      .on("error", reject);
  });
}

export async function procesarCSVEstudiantes(buffer) {
  const filas = await leerCSV(buffer);
  const columnasRequeridas = ["CODIGO", "CODIGO HIK", "APELLIDOS", "NOMBRES", "SECCION", "CURSO", "PARALELO"];
  if (!filas.length) throw new Error("El CSV está vacío. No se modificó ningún estudiante.");
  const faltantes = columnasRequeridas.filter(columna => !Object.prototype.hasOwnProperty.call(filas[0], columna));
  if (faltantes.length) throw new Error("El CSV no contiene las columnas requeridas: " + faltantes.join(", ") + ". No se modificó ningún estudiante.");

  const codigos = new Set();
  const estudiantesCSV = [];
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const codigo = normalizarCodigo(fila["CODIGO"]);
    const apellidos = normalizarTexto(fila["APELLIDOS"]);
    const nombres = normalizarTexto(fila["NOMBRES"]);
    if (!codigo || !apellidos || !nombres) {
      throw new Error("La fila " + (i + 2) + " no tiene código, apellidos o nombres. Importación cancelada para evitar retirar alumnos por error.");
    }
    if (codigos.has(codigo)) {
      throw new Error("El código " + codigo + " aparece más de una vez en el CSV. Corrige el archivo antes de importar.");
    }
    codigos.add(codigo);
    estudiantesCSV.push({
      codigo,
      codigo_hik: normalizarCodigo(fila["CODIGO HIK"]),
      apellidos,
      nombres,
      seccion: normalizarTexto(fila["SECCION"]),
      curso: normalizarTexto(fila["CURSO"]),
      paralelo: normalizarTexto(fila["PARALELO"]),
      estado: "A"
    });
  }

  let registros_insertados = 0;
  let registros_actualizados = 0;
  let registros_error = 0;

  // Primero actualiza o crea todos los registros incluidos en el CSV.
  for (const estudiante of estudiantesCSV) {
    const { data: existente, error: errorBuscar } = await supabase
      .from("estudiantes")
      .select("id")
      .eq("codigo", estudiante.codigo)
      .maybeSingle();

    if (errorBuscar) throw new Error("No se pudo validar el código " + estudiante.codigo + ": " + errorBuscar.message);

    if (existente) {
      const { error } = await supabase.from("estudiantes").update(estudiante).eq("id", existente.id);
      if (error) throw new Error("No se pudo actualizar el estudiante " + estudiante.codigo + ": " + error.message);
      registros_actualizados++;
    } else {
      const { error } = await supabase.from("estudiantes").insert(estudiante);
      if (error) throw new Error("No se pudo insertar el estudiante " + estudiante.codigo + ": " + error.message);
      registros_insertados++;
    }
  }

  // Solo después de importar correctamente todas las filas, marca R a quienes ya no están en el CSV.
  const { data: existentes, error: errorListado } = await supabase
    .from("estudiantes")
    .select("id,codigo")
    .neq("estado", "R");

  if (errorListado) throw new Error("Los estudiantes fueron importados, pero no se pudo comparar el padrón para detectar retirados: " + errorListado.message);

  const codigosActivosCSV = new Set(estudiantesCSV.map(estudiante => estudiante.codigo));
  const idsRetirados = (existentes || [])
    .filter(estudiante => !codigosActivosCSV.has(normalizarCodigo(estudiante.codigo)))
    .map(estudiante => estudiante.id);

  let registros_retirados = 0;
  for (let i = 0; i < idsRetirados.length; i += 500) {
    const bloque = idsRetirados.slice(i, i + 500);
    const { error } = await supabase.from("estudiantes").update({ estado: "R" }).in("id", bloque);
    if (error) throw new Error("No se pudo marcar a todos los estudiantes retirados: " + error.message);
    registros_retirados += bloque.length;
  }

  return {
    total_registros: estudiantesCSV.length,
    registros_insertados,
    registros_actualizados,
    registros_retirados,
    registros_error
  };
}
