import csv from "csv-parser";
import { Readable } from "stream";
import { supabase } from "../config/supabaseClient.js";

const TAMANO_LOTE = 500;
const CONCURRENCIA_ACTUALIZACIONES = 15;

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
      .pipe(csv({ mapHeaders: ({ header }) => String(header || "").replace(/^\uFEFF/, "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() }))
      .on("data", row => registros.push(row))
      .on("end", () => resolve(registros))
      .on("error", reject);
  });
}

async function ejecutarEnLotes(items, tamano, ejecutar) {
  for (let i = 0; i < items.length; i += tamano) {
    await ejecutar(items.slice(i, i + tamano));
  }
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

  // Lee el padrón existente en páginas para evitar una consulta individual por alumno.
  const existentes = [];
  for (let desde = 0; ; desde += TAMANO_LOTE) {
    const { data, error } = await supabase
      .from("estudiantes")
      .select("id,codigo,estado")
      .order("id", { ascending: true })
      .range(desde, desde + TAMANO_LOTE - 1);

    if (error) throw new Error("No se pudo consultar el padrón de estudiantes: " + error.message);
    existentes.push(...(data || []));
    if (!data || data.length < TAMANO_LOTE) break;
  }

  const existentesPorCodigo = new Map(
    existentes.map(estudiante => [normalizarCodigo(estudiante.codigo), estudiante])
  );
  const paraInsertar = [];
  const paraActualizar = [];

  for (const estudiante of estudiantesCSV) {
    const existente = existentesPorCodigo.get(estudiante.codigo);
    if (existente) {
      paraActualizar.push({ id: existente.id, ...estudiante });
    } else {
      paraInsertar.push(estudiante);
    }
  }

  let registros_insertados = 0;
  let registros_actualizados = 0;
  let registros_retirados = 0;
  let registros_error = 0;

  // Inserta nuevos alumnos en lotes, reduciendo las llamadas a la API.
  await ejecutarEnLotes(paraInsertar, TAMANO_LOTE, async lote => {
    const { error } = await supabase.from("estudiantes").insert(lote);
    if (error) throw new Error("No se pudo insertar un lote de estudiantes: " + error.message);
    registros_insertados += lote.length;
  });

  // Actualiza los existentes con concurrencia limitada para acelerar la carga
  // sin saturar Supabase ni cambiar la lógica de actualización por código.
  await ejecutarEnLotes(paraActualizar, CONCURRENCIA_ACTUALIZACIONES, async lote => {
    const resultados = await Promise.all(lote.map(async estudiante => {
      const { id, ...datos } = estudiante;
      const { error } = await supabase.from("estudiantes").update(datos).eq("id", id);
      return { codigo: estudiante.codigo, error };
    }));

    const fallidos = resultados.filter(resultado => resultado.error);
    if (fallidos.length) {
      const primero = fallidos[0];
      throw new Error("No se pudo actualizar el estudiante " + primero.codigo + ": " + primero.error.message);
    }
    registros_actualizados += lote.length;
  });

  // Solo después de importar correctamente todas las filas, marca como retirados
  // a los alumnos que estaban activos y ya no aparecen en el CSV.
  const codigosActivosCSV = new Set(estudiantesCSV.map(estudiante => estudiante.codigo));
  const idsRetirados = existentes
    .filter(estudiante => estudiante.estado !== "R" && !codigosActivosCSV.has(normalizarCodigo(estudiante.codigo)))
    .map(estudiante => estudiante.id);

  await ejecutarEnLotes(idsRetirados, TAMANO_LOTE, async bloque => {
    const { error } = await supabase.from("estudiantes").update({ estado: "R" }).in("id", bloque);
    if (error) throw new Error("No se pudo marcar a todos los estudiantes retirados: " + error.message);
    registros_retirados += bloque.length;
  });

  return {
    total_registros: estudiantesCSV.length,
    registros_insertados,
    registros_actualizados,
    registros_retirados,
    registros_error
  };
}
