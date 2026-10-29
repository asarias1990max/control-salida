import crypto from "crypto";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";
import { supabase } from "../config/supabaseClient.js";

dotenv.config();

const HIK_BASE_URL = process.env.HIK_BASE_URL;
const HIK_APP_KEY = process.env.HIK_APP_KEY;
const HIK_APP_SECRET = process.env.HIK_APP_SECRET;

const ADD_PERSONS_PATH = "/artemis/api/acs/v1/privilege/group/single/addPersons";
const ACCESS_DOORS_PATH = "/artemis/api/resource/v1/acsDoor/acsDoorList";
const ACCESS_LEVELS_PATH = "/artemis/api/acs/v1/privilege/group";
const ACCESS_LEVEL_PERSONS_PATH = "/artemis/api/acs/v1/privilege/group/single/personList";

function generarFirma(method, path, timestamp, nonce, accept = "*/*") {
  const stringToSign =
    method + "\n" +
    accept + "\n" +
    "application/json\n" +
    "x-ca-key:" + HIK_APP_KEY + "\n" +
    "x-ca-nonce:" + nonce + "\n" +
    "x-ca-timestamp:" + timestamp + "\n" +
    path;

  console.log(`[HikCentral] Firmando solicitud ${method} ${path} (timestamp=${timestamp}, nonce=${nonce})`);

  return crypto
    .createHmac("sha256", HIK_APP_SECRET)
    .update(stringToSign, "utf8")
    .digest("base64");
}

export async function asignarEstudianteNivelAcceso({ privilegeGroupId, codigoHik }) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();

  const body = {
    privilegeGroupId: String(privilegeGroupId),
    type: 1,
    list: [
      {
        id: String(codigoHik)
      }
    ]
  };

  const signature = generarFirma("POST", ADD_PERSONS_PATH, timestamp, nonce);

  const url = HIK_BASE_URL + ADD_PERSONS_PATH;

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false
  });

  let response;
  try {
    response = await axios.post(url, body, {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "X-Ca-Key": HIK_APP_KEY,
        "X-Ca-Timestamp": timestamp,
        "X-Ca-Nonce": nonce,
        "X-Ca-Signature": signature,
        "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp"
      },
      timeout: 20000
    });
  } catch (error) {
    const status = error.response?.status;
    const result = error.response?.data;
    const detalleHik = result
      ? ` HikCentral code=${result.code ?? "sin código"}; msg=${result.msg ?? "sin mensaje"}; trace_id=${result.data?.traceId ?? result.traceId ?? result.data?.trace_id ?? result.trace_id ?? "no disponible"}.`
      : "";
    const detalleRed = error.code ? ` Código de red: ${error.code}.` : "";
    throw new Error(
      `No se pudo completar la asignación en HikCentral.${status ? ` HTTP ${status}.` : ""}${detalleHik}${detalleRed}${!status && !error.code ? ` Detalle: ${error.message}` : ""}`
    );
  }

  const result = response.data;
  if (!result || (result.code !== undefined && String(result.code) !== "0")) {
    const traceId = result?.data?.traceId || result?.traceId || result?.data?.trace_id || result?.trace_id;
    throw new Error(
      `HikCentral rechazó la asignación: code=${result?.code ?? "sin código"}; msg=${result?.msg || "respuesta no válida"}${traceId ? `; trace_id=${traceId}` : ""}.`
    );
  }

  console.log("[HikCentral] Asignación de estudiante: respuesta recibida.", JSON.stringify(result));
  return result;
}

/**
 * Obtiene todos los niveles de acceso de control configurados en HikCentral.
 * API documentada: POST /artemis/api/acs/v1/privilege/group
 */
export async function obtenerNivelesAccesoHik() {
  if (!HIK_BASE_URL || !HIK_APP_KEY || !HIK_APP_SECRET) {
    throw new Error("Falta configurar HIK_BASE_URL, HIK_APP_KEY o HIK_APP_SECRET.");
  }

  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const pageSize = 500;
  let pageNo = 1;
  let total = Infinity;
  const niveles = [];

  while (niveles.length < total) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = { pageNo, pageSize, type: 1 };
    const signature = generarFirma("POST", ACCESS_LEVELS_PATH, timestamp, nonce);

    const response = await axios.post(HIK_BASE_URL + ACCESS_LEVELS_PATH, body, {
      httpsAgent,
      headers: {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "X-Ca-Key": HIK_APP_KEY,
        "X-Ca-Timestamp": timestamp,
        "X-Ca-Nonce": nonce,
        "X-Ca-Signature": signature,
        "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp"
      },
      timeout: 20000
    });

    const result = response.data;
    if (!result || String(result.code) !== "0") {
      const traceId = result?.data?.traceId || result?.traceId || result?.data?.trace_id || result?.trace_id;
      const detalle = "code=" + (result?.code ?? "sin código") + "; msg=" + (result?.msg || "respuesta no válida") + (traceId ? "; trace_id=" + traceId : "");
      throw new Error("HikCentral rechazó la consulta de niveles de acceso (" + detalle + ").");
    }

    const data = result.data || {};
    const list = Array.isArray(data.list) ? data.list : [];
    total = Number(data.total ?? list.length);
    niveles.push(...list);

    if (list.length === 0 || list.length < pageSize || niveles.length >= total) break;
    pageNo += 1;
  }

  return niveles.map((item) => ({
    id: String(item.privilegeGroupId ?? ""),
    nombre: String(item.privilegeGroupName ?? ""),
    descripcion: String(item.description ?? ""),
    timeSchedule: item.timeSchedule || null,
    datosOriginales: item
  })).filter((item) => item.id && item.nombre);
}



function extraerHoraSalidaNivel(texto) {
  const valor = String(texto || "");
  const patrones = [
    /(?:salida|exit)[^0-9]{0,30}(\d{1,2})\s*[h:]\s*(\d{2})/i,
    /\b(\d{1,2}):(\d{2})\b/
  ];
  for (const patron of patrones) {
    const match = valor.match(patron);
    if (!match) continue;
    const hora = Number(match[1]);
    const minuto = Number(match[2]);
    if (hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59) {
      return String(hora).padStart(2, "0") + ":" + String(minuto).padStart(2, "0") + ":00";
    }
  }
  return null;
}

async function postArtemis(path, body) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const signature = generarFirma("POST", path, timestamp, nonce);
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const response = await axios.post(HIK_BASE_URL + path, body, {
    httpsAgent, timeout: 25000,
    headers: { "Content-Type": "application/json", "Accept": "*/*", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": timestamp, "X-Ca-Nonce": nonce, "X-Ca-Signature": signature, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" }
  });
  if (!response.data || String(response.data.code) !== "0") {
    throw new Error("HikCentral " + path + ": code=" + (response.data?.code ?? "sin código") + "; msg=" + (response.data?.msg || "respuesta no válida"));
  }
  return response.data.data || {};
}

/**
 * Sincroniza niveles y sus personas desde HikCentral a Supabase.
 * Los horarios solo se interpretan cuando aparecen explícitamente en el nombre/descripción.
 */
export async function sincronizarNivelesYAsignacionesHik() {
  if (!HIK_BASE_URL || !HIK_APP_KEY || !HIK_APP_SECRET) throw new Error("Falta configurar HikCentral.");
  const niveles = await obtenerNivelesAccesoHik();
  const listaNiveles = [];
  // La respuesta documentada de privilege/group ya incluye timeSchedule.indexCode y timeSchedule.name.
  // No se llama a un endpoint de plantillas separado porque no se ha verificado en la referencia OpenAPI disponible.
  const filasHorarios = niveles.map(nivel => {
    const horario = nivel.timeSchedule || {};
    return {
      index_code: String(horario.indexCode ?? ""),
      nombre: String(horario.name ?? "Horario sin nombre"),
      datos_originales: horario,
      sincronizado_en: new Date().toISOString()
    };
  }).filter(h => h.index_code);
  const horarioPorId = new Map(filasHorarios.map(h => [h.index_code, h]));
  const asignaciones = [];
  const estudiantesResult = await supabase.from("estudiantes")
    .select("id,codigo,codigo_hik,apellidos,nombres,estado")
    .eq("estado", true)
    .not("codigo_hik", "is", null);
  if (estudiantesResult.error) throw new Error("No se pudieron cargar estudiantes: " + estudiantesResult.error.message);
  const estudiantes = estudiantesResult.data || [];
  const estudiantePorCodigoHik = new Map(estudiantes.map(e => [String(e.codigo_hik || "").trim().toLowerCase(), e]).filter(([k]) => k));
  let personasConsultadas = 0;
  let personasSinCoincidencia = 0;
  let erroresDetallePersona = 0;
  const cacheDetallesPersona = new Map();
  const inicioSincronizacion = new Date().toISOString();

  for (const nivel of niveles) {
    const groupOriginal = nivel.datosOriginales || {};
    const scheduleIndex = String(nivel.timeSchedule?.indexCode ?? "");
    const horarioApi = horarioPorId.get(scheduleIndex) || nivel.timeSchedule || {};
    const nombreHorarioApi = String(horarioApi.name || nivel.timeSchedule?.name || "");
    const textoNivel = [nivel.nombre, nivel.descripcion, nombreHorarioApi].filter(Boolean).join(" ");
    const horaSalida = extraerHoraSalidaNivel(textoNivel);
    listaNiveles.push({
      privilege_group_id: nivel.id,
      nombre: nivel.nombre,
      descripcion: nivel.descripcion || null,
      hora_salida: horaSalida,
      fuente_horario: horaSalida ? (nombreHorarioApi ? "API HikCentral: plantilla de horario" : "API HikCentral: nombre/descripción del nivel") : null,
      time_schedule_index_code: scheduleIndex || null,
      time_schedule_name: nombreHorarioApi || null,
      datos_originales: groupOriginal,
      sincronizado_en: new Date().toISOString()
    });

    const personas = [];
    let pageNo = 1;
    let totalPersonas = Infinity;
    const pageSize = 500;
    while (personas.length < totalPersonas) {
      const data = await postArtemis(ACCESS_LEVEL_PERSONS_PATH, { pageNo, pageSize, type: 1, privilegeGroupId: String(nivel.id) });
      const page = Array.isArray(data.list) ? data.list
        : Array.isArray(data.personList) ? data.personList
        : Array.isArray(data.persons) ? data.persons
        : Array.isArray(data.records) ? data.records
        : Array.isArray(data) ? data : [];
      if (pageNo === 1) totalPersonas = Number(data.total ?? data.totalNum ?? page.length);
      personas.push(...page);
      if (!page.length || page.length < pageSize || personas.length >= totalPersonas) break;
      pageNo++;
    }
    const ids = [...new Set(personas.map(p => String(p.id ?? p.personId ?? p.personCode ?? "").trim()).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 10) {
      const lote = ids.slice(i, i + 10).filter(personId => !cacheDetallesPersona.has(personId));
      const detalles = await Promise.all(lote.map(async personId => {
        try {
          const infoData = await postArtemis("/artemis/api/resource/v1/person/personId/personInfo", { personId });
          return { personId, info: infoData };
        } catch (error) {
          erroresDetallePersona++;
          console.warn("[HikCentral] No se pudo resolver persona para nivel", nivel.nombre, personId, error.message);
          return { personId, info: null };
        }
      }));
      detalles.forEach(detalle => cacheDetallesPersona.set(detalle.personId, detalle.info));
    }
    for (const personId of ids) {
      const info = cacheDetallesPersona.get(personId);
      if (!info) { personasSinCoincidencia++; continue; }
      personasConsultadas++;
      const claves = [info.personCode, info.personId, personId].map(v => String(v ?? "").trim().toLowerCase()).filter(Boolean);
      const estudiante = claves.map(k => estudiantePorCodigoHik.get(k)).find(Boolean);
      if (!estudiante) { personasSinCoincidencia++; continue; }
      asignaciones.push({
        estudiante_id: estudiante.id,
        privilege_group_id: String(nivel.id),
        person_id_hik: String(info.personId || personId),
        asignado_en: inicioSincronizacion,
        datos_originales: { personId, personCode: info.personCode || null, personName: info.personName || null }
      });
    }
  }

  if (erroresDetallePersona > 0) throw new Error("La sincronización se detuvo porque falló la consulta de " + erroresDetallePersona + " detalles de personas en HikCentral. No se reemplazaron las asignaciones existentes; revisa el log del servidor.");
  if (filasHorarios.length) {
    const { error } = await supabase.from("horarios_acceso_hikcentral").upsert(filasHorarios, { onConflict: "index_code" });
    if (error) throw new Error("No se pudieron guardar plantillas de horario HikCentral: " + error.message);
  }
  if (listaNiveles.length) {
    const { error } = await supabase.from("niveles_acceso_hikcentral").upsert(listaNiveles, { onConflict: "privilege_group_id" });
    if (error) throw new Error("No se pudieron guardar niveles HikCentral: " + error.message);
  }
  // Upsert primero y eliminar registros antiguos al final para evitar vaciar la tabla si falla la sincronización.
  for (let i = 0; i < asignaciones.length; i += 500) {
    const lote = asignaciones.slice(i, i + 500);
    const { error } = await supabase.from("estudiante_niveles_acceso_hikcentral").upsert(lote, { onConflict: "estudiante_id,privilege_group_id" });
    if (error) throw new Error("No se pudieron guardar asignaciones de estudiantes: " + error.message);
  }
  const { error: borrarError } = await supabase.from("estudiante_niveles_acceso_hikcentral").delete().lt("asignado_en", inicioSincronizacion);
  if (borrarError) throw new Error("No se pudieron limpiar asignaciones antiguas: " + borrarError.message);

  // Conserva una fotografía diaria de la información que normalmente se revisa en el Excel.
  // Si se vuelve a sincronizar el mismo día, se actualiza esa fotografía sin crear duplicados.
  const fechaSnapshot = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const { data: configuracionSnapshot, error: errorConfiguracionSnapshot } = await supabase
    .from("configuracion_salidas")
    .select("nivel_acceso,hora_inicio,hora_fin,puertas,activo,fuente,updated_at")
    .order("nivel_acceso");
  if (errorConfiguracionSnapshot) throw new Error("No se pudo leer la configuración para el histórico diario: " + errorConfiguracionSnapshot.message);

  const snapshot = {
    fecha_snapshot: fechaSnapshot,
    niveles_acceso: listaNiveles,
    asignaciones_estudiantes: asignaciones,
    referencias_horario: filasHorarios,
    configuracion_salidas: configuracionSnapshot || [],
    total_niveles: listaNiveles.length,
    total_asignaciones: asignaciones.length,
    total_horarios: filasHorarios.length,
    sincronizado_en: new Date().toISOString()
  };
  const { error: errorSnapshot } = await supabase
    .from("historial_diario_hikcentral")
    .upsert(snapshot, { onConflict: "fecha_snapshot" });
  if (errorSnapshot) throw new Error("No se pudo guardar el histórico diario de HikCentral: " + errorSnapshot.message);

  return {
    fechaSnapshot,
    nivelesSincronizados: listaNiveles.length,
    asignacionesSincronizadas: asignaciones.length,
    personasConsultadas,
    personasSinCoincidencia,
    referenciasHorarioHikCentral: filasHorarios.length,
    horariosDetectadosDesdeNombreDescripcion: listaNiveles.filter(n => n.hora_salida).length
  };
}

/**
 * Obtiene el total de personas asociadas a cada nivel de acceso.
 * API documentada: POST /artemis/api/acs/v1/privilege/group/single/personList
 * Se solicita pageSize=1 porque HikCentral devuelve el total en data.total.
 */
export async function obtenerConteoPersonasNivelesHik(nivelId = "") {
  const todosLosNiveles = await obtenerNivelesAccesoHik();
  const niveles = nivelId
    ? todosLosNiveles.filter((nivel) => nivel.id === String(nivelId))
    : []; 
  if (nivelId && niveles.length === 0) {
    throw new Error("El nivel de acceso seleccionado no existe en HikCentral.");
  }
  if (!nivelId) return [];
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  const conteos = await Promise.all(niveles.map(async (nivel) => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = {
      pageNo: 1,
      pageSize: 1,
      type: 1,
      privilegeGroupId: String(nivel.id)
    };
    const signature = generarFirma("POST", ACCESS_LEVEL_PERSONS_PATH, timestamp, nonce);

    let response;
    try {
      response = await axios.post(HIK_BASE_URL + ACCESS_LEVEL_PERSONS_PATH, body, {
        httpsAgent,
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "X-Ca-Key": HIK_APP_KEY,
          "X-Ca-Timestamp": timestamp,
          "X-Ca-Nonce": nonce,
          "X-Ca-Signature": signature,
          "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp"
        },
        timeout: 20000
      });
    } catch (error) {
      const status = error.response?.status;
      const result = error.response?.data;
      const detalle = result
        ? ` code=${result.code ?? "sin código"}; msg=${result.msg ?? "sin mensaje"}.`
        : error.code ? ` error de red=${error.code}.` : ` detalle=${error.message}.`;
      throw new Error(`No se pudo consultar el conteo del nivel "${nivel.nombre}" (ID ${nivel.id}).${status ? ` HTTP ${status}.` : ""}${detalle}`);
    }

    const result = response.data;
    if (!result || String(result.code) !== "0") {
      const traceId = result?.data?.traceId || result?.traceId || result?.data?.trace_id || result?.trace_id;
      throw new Error(
        `HikCentral rechazó el conteo del nivel "${nivel.nombre}" (ID ${nivel.id}): code=${result?.code ?? "sin código"}; msg=${result?.msg || "respuesta no válida"}${traceId ? `; trace_id=${traceId}` : ""}.`
      );
    }

    const total = Number(result.data?.total);
    if (!Number.isFinite(total) || total < 0) {
      throw new Error(`HikCentral no devolvió un total válido para el nivel "${nivel.nombre}" (ID ${nivel.id}).`);
    }

    return { id: nivel.id, nombre: nivel.nombre, descripcion: nivel.descripcion, totalAlumnos: total };
  }));

  return conteos;
}

/**
 * Devuelve únicamente los nombres de las personas asociadas al nivel seleccionado.
 */
export async function obtenerPersonasNivelAccesoHik(nivelId = "") {
  if (!nivelId) throw new Error("Selecciona un nivel de acceso.");
  const niveles = await obtenerNivelesAccesoHik();
  const nivel = niveles.find((item) => item.id === String(nivelId));
  if (!nivel) throw new Error("El nivel de acceso seleccionado no existe en HikCentral.");

  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const personas = [];
  let pageNo = 1;
  let total = Infinity;
  const pageSize = 100;

  while (personas.length < total) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = { pageNo, pageSize, type: 1, privilegeGroupId: String(nivel.id) };
    const signature = generarFirma("POST", ACCESS_LEVEL_PERSONS_PATH, timestamp, nonce);
    let response;
    try {
      response = await axios.post(HIK_BASE_URL + ACCESS_LEVEL_PERSONS_PATH, body, {
        httpsAgent,
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "X-Ca-Key": HIK_APP_KEY,
          "X-Ca-Timestamp": timestamp,
          "X-Ca-Nonce": nonce,
          "X-Ca-Signature": signature,
          "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp"
        },
        timeout: 20000
      });
    } catch (error) {
      const result = error.response?.data;
      throw new Error(`No se pudo consultar los alumnos de "${nivel.nombre}". ${result ? `HikCentral code=${result.code ?? "sin código"}; msg=${result.msg ?? "sin mensaje"}.` : error.message}`);
    }

    const result = response.data;
    if (!result || String(result.code) !== "0") {
      throw new Error(`HikCentral rechazó la consulta de alumnos de "${nivel.nombre}": code=${result?.code ?? "sin código"}; msg=${result?.msg || "respuesta no válida"}.`);
    }

    const data = result.data || {};
    const list = Array.isArray(data.list) ? data.list
      : Array.isArray(data.personList) ? data.personList
      : Array.isArray(data.persons) ? data.persons
      : Array.isArray(data.records) ? data.records
      : Array.isArray(data) ? data : [];
    if (pageNo === 1) {
      console.log("[HikCentral] personList estructura:", JSON.stringify({
        dataKeys: data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [],
        listLength: list.length,
        firstPersonKeys: list[0] && typeof list[0] === "object" ? Object.keys(list[0]) : []
      }));
    }
    total = Number(data.total ?? data.totalNum ?? list.length);
    personas.push(...list);
    if (list.length === 0 || list.length < pageSize || personas.length >= total) break;
    pageNo += 1;
  }

  // personList de privilegios devuelve únicamente { id }; consultar el detalle
  // de cada persona usando el endpoint oficial de información por ID.
  const PERSON_INFO_PATH = "/artemis/api/resource/v1/person/personId/personInfo";
  const alumnos = [];
  const ids = [...new Set(personas.map((persona) => String(persona.id ?? "").trim()).filter(Boolean))];

  for (let i = 0; i < ids.length; i += 10) {
    const lote = ids.slice(i, i + 10);
    const detalles = await Promise.all(lote.map(async (personId) => {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const signature = generarFirma("POST", PERSON_INFO_PATH, timestamp, nonce);
      try {
        const response = await axios.post(HIK_BASE_URL + PERSON_INFO_PATH, { personId }, {
          httpsAgent,
          headers: {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "X-Ca-Key": HIK_APP_KEY,
            "X-Ca-Timestamp": timestamp,
            "X-Ca-Nonce": nonce,
            "X-Ca-Signature": signature,
            "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp"
          },
          timeout: 20000
        });
        const result = response.data;
        if (!result || String(result.code) !== "0") {
          console.error("[HikCentral] No se pudo obtener detalle de persona", personId, "code=", result?.code, "msg=", result?.msg);
          return null;
        }
        const info = result.data || {};
        const nombre = info.personName || [info.personGivenName, info.personFamilyName].filter(Boolean).join(" ");
        return nombre ? { nombre: String(nombre).trim() } : null;
      } catch (error) {
        console.error("[HikCentral] Error obteniendo detalle de persona", personId, error.response?.data?.msg || error.message);
        return null;
      }
    }));
    alumnos.push(...detalles.filter(Boolean));
  }

  return { nivel: nivel.nombre, total: Number.isFinite(total) ? total : ids.length, alumnos };
}

const DOOR_EVENTS_PATH = "/artemis/api/acs/v1/door/events";

export async function obtenerPuertasHik() {
  if (!HIK_BASE_URL || !HIK_APP_KEY || !HIK_APP_SECRET) throw new Error("Falta configurar HikCentral.");
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const puertas = [];
  let pageNo = 1;
  let total = Infinity;
  const pageSize = 500;
  while (puertas.length < total) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = { pageNo, pageSize };
    const signature = generarFirma("POST", ACCESS_DOORS_PATH, timestamp, nonce, "application/json");
    const response = await axios.post(HIK_BASE_URL + ACCESS_DOORS_PATH, body, {
      httpsAgent, timeout: 30000,
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": timestamp, "X-Ca-Nonce": nonce, "X-Ca-Signature": signature, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" }
    });
    const result = response.data;
    if (!result || String(result.code) !== "0") throw new Error("No se pudieron obtener las puertas de HikCentral: code=" + (result?.code ?? "sin código") + "; msg=" + (result?.msg || "respuesta no válida"));
    const data = result.data || {};
    const list = Array.isArray(data.list) ? data.list
      : Array.isArray(data.acsDoorList) ? data.acsDoorList
      : Array.isArray(data.records) ? data.records
      : Array.isArray(data.pageData) ? data.pageData
      : [];
    if (pageNo === 1) console.log("[HikCentral] acsDoorList estructura:", JSON.stringify({ dataKeys: Object.keys(data), listLength: list.length, firstDoor: list[0] || null, total: data.total }));
    total = Number(data.total ?? data.totalNum ?? list.length);
    puertas.push(...list);
    if (!list.length || list.length < pageSize || puertas.length >= total) break;
    pageNo++;
  }
  return puertas.map(p => ({
    doorIndexCode: String(p.doorIndexCode ?? p.indexCode ?? p.doorCode ?? ""),
    doorName: String(p.doorName ?? p.acsDoorName ?? p.name ?? p.doorNo ?? p.doorIndexCode ?? p.indexCode ?? p.doorCode ?? "Puerta sin nombre")
  })).filter(p => p.doorIndexCode);
}

export async function obtenerDashboardEventosHik(fechaInicio, fechaFin, codigosPuerta = []) {
  if (!HIK_BASE_URL || !HIK_APP_KEY || !HIK_APP_SECRET) throw new Error("Falta configurar HikCentral.");
  const now = new Date();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const inicio = fechaInicio || hoy;
  const fin = fechaFin || hoy;
  if (inicio > fin) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  const puertas = await obtenerPuertasHik();
  const codigosDisponibles = puertas.map(p => p.doorIndexCode);
  const puertaPorCodigo = new Map(puertas.map(p => [String(p.doorIndexCode), String(p.doorName || p.doorIndexCode)]));
  const solicitados = Array.isArray(codigosPuerta) ? codigosPuerta.map(String) : [];
  const doorIndexCodes = solicitados.length
    ? codigosDisponibles.filter(code => solicitados.includes(code))
    : codigosDisponibles;
  if (!doorIndexCodes.length) throw new Error("Selecciona al menos una puerta válida de HikCentral.");
  console.log("[HikCentral] Puntos de acceso seleccionados para eventos:", doorIndexCodes.length);

  // El manual OpenAPI define eventType como un único código numérico por petición.
  // Consultamos concesiones faciales y fallos relevantes para que el dashboard no omita los errores.
  const tiposEvento = [
    { codigo: 196893, nombre: "Access Granted by Face" },
    { codigo: 197151, nombre: "Access Denied by Face" },
    { codigo: 197160, nombre: "Facial Recognition Failed" },
    { codigo: 197383, nombre: "Anti-passback Violation" },
    { codigo: 197384, nombre: "Invalid Time Period" },
    { codigo: 197635, nombre: "No Access Level Assigned" }
  ];
  const eventos = [];
  const pageSize = 500;
  const advertenciasConsulta = [];
  // Consultar tipos independientes en paralelo reduce la espera al cambiar de fecha.
  // Cada tipo conserva su propia paginación y sus advertencias; no se ocultan fallos parciales.
  const resultadosPorTipo = await Promise.all(tiposEvento.map(async tipo => {
    const recogidosTipo = [];
    let pageNo = 1;
    let total = Infinity;
    try {
      while (recogidosTipo.length < total) {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomUUID();
        const body = { startTime: inicio + "T00:00:00-05:00", endTime: fin + "T23:59:59-05:00", eventType: tipo.codigo, doorIndexCodes, pageNo, pageSize, sortField: "SwipeTime", orderType: 1 };
        const signature = generarFirma("POST", DOOR_EVENTS_PATH, timestamp, nonce);
        const response = await axios.post(HIK_BASE_URL + DOOR_EVENTS_PATH, body, { httpsAgent, timeout: 30000, headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": timestamp, "X-Ca-Nonce": nonce, "X-Ca-Signature": signature, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" } });
        const result = response.data;
        if (!result || String(result.code) !== "0") throw new Error("code=" + (result?.code ?? "sin código") + "; msg=" + (result?.msg || "respuesta no válida"));
        const data = result.data || {};
        const list = Array.isArray(data.list) ? data.list : Array.isArray(data.events) ? data.events : Array.isArray(data.records) ? data.records : Array.isArray(data.eventList) ? data.eventList : [];
        if (pageNo === 1) console.log("[HikCentral] door/events:", JSON.stringify({ eventType: tipo.codigo, nombre: tipo.nombre, dataKeys: Object.keys(data), listLength: list.length, total: data.total }));
        total = Number(data.total ?? list.length);
        recogidosTipo.push(...list.map(evento => ({ ...evento, eventType: String(evento.eventType ?? evento.eventTypeCode ?? tipo.codigo), eventName: evento.eventName || evento.eventTypeName || tipo.nombre })));
        // No asumir que una página incompleta significa que terminó la consulta:
        // algunas versiones/proxies limitan el tamaño efectivo de página.
        if (!list.length || recogidosTipo.length >= total) break;
        pageNo++;
        if (pageNo > 10000) throw new Error("Se alcanzó el límite de seguridad de paginación para " + tipo.codigo + ".");
      }
      return { tipo, eventos: recogidosTipo, error: null };
    } catch (error) {
      const aviso = "No se pudieron consultar eventos de tipo " + tipo.codigo + " (" + tipo.nombre + "): " + (error.response?.data?.msg || error.message);
      console.warn("[HikCentral]", aviso);
      return { tipo, eventos: recogidosTipo, error: aviso };
    }
  }));
  for (const resultadoTipo of resultadosPorTipo) {
    eventos.push(...resultadoTipo.eventos);
    if (resultadoTipo.error) advertenciasConsulta.push(resultadoTipo.error);
  }
  if (!eventos.length) throw new Error("HikCentral no devolvió eventos para ninguno de los tipos consultados. " + advertenciasConsulta.join(" | "));
  // Deduplicar por eventId si el mismo registro aparece en más de una consulta.
  const eventosUnicos = [...new Map(eventos.map((evento, i) => [String(evento.eventId || evento.eventIndexCode || [evento.eventTime || evento.SwipeTime, evento.personId, evento.doorIndexCode, evento.eventType, i].join("|")), evento])).values()];
  const totalEventosRecibidosHik = eventosUnicos.length;
  // La tabla estudiantes de Supabase es la fuente autorizada del dashboard.
  // Solo se muestran eventos cuyo identificador coincide con codigo_hik de un estudiante activo.
  const estudiantes = [];
  const tamanoPaginaEstudiantes = 1000;
  for (let desde = 0; ; desde += tamanoPaginaEstudiantes) {
    const { data, error } = await supabase
      .from("estudiantes")
      .select("id, codigo_hik, codigo, apellidos, nombres, seccion, curso, paralelo, estado")
      .eq("estado", true)
      .not("codigo_hik", "is", null)
      .range(desde, desde + tamanoPaginaEstudiantes - 1);
    if (error) throw new Error("No se pudo consultar la lista de estudiantes de Supabase: " + error.message);
    estudiantes.push(...(data || []));
    if (!data || data.length < tamanoPaginaEstudiantes) break;
  }

  const normalizarIdentificador = (valor) => String(valor ?? "").trim().toLowerCase();
  const estudiantePorCodigoHik = new Map();
  estudiantes.forEach(estudiante => {
    const codigoHik = normalizarIdentificador(estudiante.codigo_hik);
    if (codigoHik) estudiantePorCodigoHik.set(codigoHik, estudiante);
  });

  const personIdInfoPath = "/artemis/api/resource/v1/person/personId/personInfo";
  const eventosSoloEstudiantes = [];
  const cachePersonaPorId = new Map();
  // Resolver personId únicos por lotes paralelos; la búsqueda sigue siendo en vivo en HikCentral.
  const personIdsPendientes = [...new Set(eventosUnicos
    .filter(evento => {
      const ids = [evento.personCode, evento.employeeNo, evento.employeeNoString, evento.personInfo?.personCode, evento.personId, evento.personInfo?.personId].map(normalizarIdentificador).filter(Boolean);
      return !ids.some(id => estudiantePorCodigoHik.has(id));
    })
    .map(evento => String(evento.personId || evento.personInfo?.personId || "").trim()).filter(Boolean))];
  for (let i = 0; i < personIdsPendientes.length; i += 10) {
    const lote = personIdsPendientes.slice(i, i + 10);
    const detalles = await Promise.all(lote.map(async personId => {
      try {
        const ts = Date.now().toString();
        const nonce = crypto.randomUUID();
        const firma = generarFirma("POST", personIdInfoPath, ts, nonce);
        const resp = await axios.post(HIK_BASE_URL + personIdInfoPath, { personId }, {
          httpsAgent, timeout: 20000,
          headers: { "Content-Type": "application/json", "Accept": "*/*", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": ts, "X-Ca-Nonce": nonce, "X-Ca-Signature": firma, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" }
        });
        return [personId, resp.data && String(resp.data.code) === "0" ? (resp.data.data || null) : null];
      } catch (error) {
        console.warn("[HikCentral] No se pudo resolver personId de evento", personId, error.response?.data?.msg || error.message);
        return [personId, null];
      }
    }));
    detalles.forEach(([id, info]) => cachePersonaPorId.set(id, info));
  }
  for (const evento of eventosUnicos) {
    const identificadores = [evento.personCode, evento.employeeNo, evento.employeeNoString, evento.personInfo?.personCode, evento.personId, evento.personInfo?.personId]
      .map(normalizarIdentificador).filter(Boolean);
    let estudiante = identificadores.map(id => estudiantePorCodigoHik.get(id)).find(Boolean);
    let infoPersona = evento.personInfo || null;
    if (!estudiante) {
      const personId = String(evento.personId || evento.personInfo?.personId || "").trim();
      if (personId) {
        infoPersona = cachePersonaPorId.get(personId) || infoPersona;
        const codigoResuelto = normalizarIdentificador(infoPersona?.personCode || infoPersona?.employeeNo || "");
        if (codigoResuelto) estudiante = estudiantePorCodigoHik.get(codigoResuelto);
      }
    }
    if (!estudiante) continue;
    const nombreEstudiante = [estudiante.apellidos, estudiante.nombres].filter(Boolean).join(" ").trim();
    eventosSoloEstudiantes.push({
      ...evento,
      personCode: evento.personCode || infoPersona?.personCode || estudiante.codigo_hik,
      personName: nombreEstudiante || evento.personName || infoPersona?.personName || evento.name || "Estudiante",
      personInfo: infoPersona || evento.personInfo,
      studentId: estudiante.id,
      studentCode: estudiante.codigo || "",
      studentHikCode: estudiante.codigo_hik,
      studentSection: estudiante.seccion || "",
      studentCourse: estudiante.curso || "",
      studentParallel: estudiante.paralelo || ""
    });
  }

  console.log("[Dashboard] Filtro Supabase aplicado:", JSON.stringify({
    fechaInicio: inicio,
    fechaFin: fin,
    estudiantesActivosConCodigoHik: estudiantePorCodigoHik.size,
    eventosRecibidosDeHikCentral: totalEventosRecibidosHik,
    eventosAsociadosAEstudiantes: eventosSoloEstudiantes.length
  }));

  // Evita que una consulta exitosa de HikCentral con identificadores no reconocidos
  // parezca válida y haga que el dashboard reutilice eventos históricos de Supabase.
  if (totalEventosRecibidosHik > 0 && eventosSoloEstudiantes.length === 0) {
    throw new Error("HikCentral devolvió " + totalEventosRecibidosHik + " eventos para " + inicio + "–" + fin +
      ", pero ninguno se pudo asociar con estudiantes activos. Se bloquea la actualización para no mostrar datos antiguos como actuales.");
  }

  // A partir de aquí se trabaja solo con eventos que coinciden con estudiantes de Supabase.
  eventos.length = 0;
  eventos.push(...eventosSoloEstudiantes);

  // Algunos modelos de HikCentral no incluyen personName en el evento.
  // Resolver los personId disponibles mediante el endpoint de detalle de persona.
  const personCodeInfoPath = "/artemis/api/resource/v1/person/personCode/personInfo";
  const personasPorClave = new Map();
  const clavesPendientes = new Map();

  eventos.forEach(evento => {
    if (evento.personName || evento.name || evento.employeeName || evento.personInfo?.personName || evento.person?.name) return;
    const personCode = evento.personCode || evento.personInfo?.personCode || evento.employeeNo || evento.employeeNoString;
    const personId = evento.personId || evento.personInfo?.personId;
    if (personCode) clavesPendientes.set("code:" + String(personCode), { tipo: "code", valor: String(personCode) });
    else if (personId) clavesPendientes.set("id:" + String(personId), { tipo: "id", valor: String(personId) });
  });

  const pendientes = [...clavesPendientes.values()];
  for (let i = 0; i < pendientes.length; i += 10) {
    const lote = pendientes.slice(i, i + 10);
    const detalles = await Promise.all(lote.map(async clave => {
      const ruta = clave.tipo === "code" ? personCodeInfoPath : personIdInfoPath;
      const ts = Date.now().toString();
      const nonceInfo = crypto.randomUUID();
      const firmaInfo = generarFirma("POST", ruta, ts, nonceInfo);
      try {
        const bodyInfo = clave.tipo === "code" ? { personCode: clave.valor } : { personId: clave.valor };
        const respInfo = await axios.post(HIK_BASE_URL + ruta, bodyInfo, {
          httpsAgent, timeout: 20000,
          headers: { "Content-Type": "application/json", "Accept": "*/*", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": ts, "X-Ca-Nonce": nonceInfo, "X-Ca-Signature": firmaInfo, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" }
        });
        const resultInfo = respInfo.data;
        if (!resultInfo || String(resultInfo.code) !== "0") {
          console.warn("[HikCentral] No se pudo resolver nombre por " + clave.tipo, resultInfo?.msg || resultInfo?.code);
          return null;
        }
        const info = resultInfo.data || {};
        const nombre = info.personName || [info.personGivenName, info.personFamilyName].filter(Boolean).join(" ") || info.name;
        return nombre ? [clave.tipo + ":" + clave.valor, String(nombre).trim()] : null;
      } catch (error) {
        console.warn("[HikCentral] Error al resolver persona por " + clave.tipo, error.response?.data?.msg || error.message);
        return null;
      }
    }));
    detalles.filter(Boolean).forEach(([clave, nombre]) => personasPorClave.set(clave, nombre));
  }

  const eventosConNombre = eventos.map(evento => {
    const personCode = evento.personCode || evento.personInfo?.personCode || evento.employeeNo || evento.employeeNoString;
    const personId = evento.personId || evento.personInfo?.personId;
    const clave = personCode ? "code:" + String(personCode) : personId ? "id:" + String(personId) : "";
    const nombre = evento.personName || evento.name || evento.employeeName || evento.personInfo?.personName || evento.person?.name || (clave ? personasPorClave.get(clave) : "");
    return nombre ? { ...evento, personName: nombre } : evento;
  });

  // Persistir eventos en Supabase para conservar el histórico diario sin duplicados.
  const normalizarFechaEvento = (valor) => {
    if (!valor) return null;
    let texto = String(valor).trim();
    if (!texto) return null;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(texto)) texto = texto.replace(" ", "T") + "-05:00";
    const fecha = new Date(texto);
    return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
  };
  const filasEventos = eventosConNombre.flatMap(evento => {
    const fechaRaw = evento.eventTime || evento.SwipeTime || evento.swipeTime || evento.time || evento.eventDate || evento.dateTime || evento.occurTime;
    const fechaEvento = normalizarFechaEvento(fechaRaw);
    const codigoHik = String(evento.studentHikCode || evento.personCode || evento.personInfo?.personCode || evento.employeeNo || evento.employeeNoString || evento.personId || evento.personInfo?.personId || "").trim();
    if (!fechaEvento || !codigoHik || !evento.studentId) return [];
    const puertaCodigo = String(evento.doorIndexCode || evento.doorCode || evento.doorNo || "");
    const puertaNombre = String(evento.doorName || evento.devName || evento.readerName || evento.srcName || evento.deviceName || puertaPorCodigo.get(puertaCodigo) || "");
    const tipoEvento = String(evento.eventName || evento.eventTypeName || evento.eventDescription || evento.eventMinorName || "");
    const tipoEventoCodigo = String(evento.eventType || evento.eventTypeCode || "");
    const resultado = String(evento.attendanceStatus || evento.eventStatus || evento.status || evento.result || evento.checkResult || evento.eventDescription || "");
    const eventId = evento.eventId || evento.eventIndexCode || evento.serialNo || evento.indexCode || null;
    const huellaBase = eventId ? "hik:" + String(eventId) : [codigoHik, fechaEvento, puertaCodigo, puertaNombre, tipoEventoCodigo, resultado].join("|");
    const eventFingerprint = crypto.createHash("sha256").update(huellaBase).digest("hex");
    return [{ event_fingerprint: eventFingerprint, event_id: eventId ? String(eventId) : null, estudiante_id: evento.studentId, codigo_hik: codigoHik, fecha_evento: fechaEvento, puerta_codigo: puertaCodigo || null, puerta_nombre: puertaNombre || null, tipo_evento: tipoEvento || null, tipo_evento_codigo: tipoEventoCodigo || null, resultado: resultado || null, datos_originales: evento, sincronizado_en: new Date().toISOString() }];
  });
  for (let i = 0; i < filasEventos.length; i += 200) {
    const lote = filasEventos.slice(i, i + 200);
    const { error } = await supabase.from("eventos_hikcentral").upsert(lote, { onConflict: "event_fingerprint", ignoreDuplicates: true });
    if (error) throw new Error("No se pudieron guardar los eventos de HikCentral en Supabase: " + error.message);
  }
  console.log("[HikCentral] Persistencia diaria:", JSON.stringify({ eventosFiltrados: eventosConNombre.length, eventosGuardados: filasEventos.length }));
  return {
    fechaInicio: inicio,
    fechaFin: fin,
    totalEventos: totalEventosRecibidosHik,
    eventosAsociadosAEstudiantes: eventosConNombre.length,
    eventosGuardados: filasEventos.length,
    advertencias: advertenciasConsulta,
    eventos: eventosConNombre
  };
}
