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
      .pipe(csv())
      .on("data", (row) => {
        registros.push(row);
      })
      .on("end", () => resolve(registros))
      .on("error", reject);
  });
}

export async function procesarCSVEstudiantes(buffer) {
  const filas = await leerCSV(buffer);

  let total_registros = filas.length;
  let registros_insertados = 0;
  let registros_actualizados = 0;
  let registros_error = 0;

  for (const fila of filas) {
    try {
      const estudiante = {
        codigo: normalizarCodigo(fila["CODIGO"]),
        codigo_hik: normalizarCodigo(fila["CODIGO HIK"]),
        apellidos: normalizarTexto(fila["APELLIDOS"]),
        nombres: normalizarTexto(fila["NOMBRES"]),
        seccion: normalizarTexto(fila["SECCIÓN"]),
        curso: normalizarTexto(fila["CURSO"]),
        paralelo: normalizarTexto(fila["PARALELO"]),
        estado: true
      };

      if (!estudiante.codigo || !estudiante.apellidos || !estudiante.nombres) {
        registros_error++;
        continue;
      }

      const { data: existente, error: errorBuscar } = await supabase
        .from("estudiantes")
        .select("id")
        .eq("codigo", estudiante.codigo)
        .maybeSingle();

      if (errorBuscar) {
        registros_error++;
        continue;
      }

      if (existente) {
        const { error: errorUpdate } = await supabase
          .from("estudiantes")
          .update(estudiante)
          .eq("codigo", estudiante.codigo);

        if (errorUpdate) {
          registros_error++;
        } else {
          registros_actualizados++;
        }
      } else {
        const { error: errorInsert } = await supabase
          .from("estudiantes")
          .insert(estudiante);

        if (errorInsert) {
          registros_error++;
        } else {
          registros_insertados++;
        }
      }

    } catch (error) {
      registros_error++;
    }
  }

  return {
    total_registros,
    registros_insertados,
    registros_actualizados,
    registros_error
  };
}