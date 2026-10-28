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
    descripcion: String(item.description ?? "")
  })).filter((item) => item.id && item.nombre);
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
  const solicitados = Array.isArray(codigosPuerta) ? codigosPuerta.map(String) : [];
  const doorIndexCodes = solicitados.length
    ? codigosDisponibles.filter(code => solicitados.includes(code))
    : codigosDisponibles;
  if (!doorIndexCodes.length) throw new Error("Selecciona al menos una puerta válida de HikCentral.");
  console.log("[HikCentral] Puntos de acceso seleccionados para eventos:", doorIndexCodes.length);

  const eventos = [];
  let pageNo = 1;
  let total = Infinity;
  const pageSize = 500;
  while (eventos.length < total) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = { startTime: inicio + "T07:30:00-05:00", endTime: fin + "T10:00:00-05:00", eventType: 196893, doorIndexCodes, pageNo, pageSize, sortField: "SwipeTime", orderType: 1 };
    const signature = generarFirma("POST", DOOR_EVENTS_PATH, timestamp, nonce);
    const response = await axios.post(HIK_BASE_URL + DOOR_EVENTS_PATH, body, { httpsAgent, timeout: 30000, headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": timestamp, "X-Ca-Nonce": nonce, "X-Ca-Signature": signature, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" } });
    const result = response.data;
    if (!result || String(result.code) !== "0") throw new Error("HikCentral rechazó los eventos: code=" + (result?.code ?? "sin código") + "; msg=" + (result?.msg || "respuesta no válida"));
    const data = result.data || {};
    const list = Array.isArray(data.list) ? data.list : Array.isArray(data.events) ? data.events : Array.isArray(data.records) ? data.records : Array.isArray(data.eventList) ? data.eventList : [];
    if (pageNo === 1) console.log("[HikCentral] door/events estructura:", JSON.stringify({ dataKeys: Object.keys(data), listLength: list.length, firstEventKeys: list[0] ? Object.keys(list[0]) : [], total: data.total, doorIndexCodes, startTime: body.startTime, endTime: body.endTime, eventType: body.eventType }));
    total = Number(data.total ?? list.length);
    eventos.push(...list);
    if (!list.length || list.length < pageSize || eventos.length >= total) break;
    pageNo++;
  }
  // La tabla estudiantes de Supabase es la fuente autorizada del dashboard.
  // Solo se muestran eventos cuyo identificador coincide con codigo_hik de un estudiante activo.
  const estudiantes = [];
  const tamanoPaginaEstudiantes = 1000;
  for (let desde = 0; ; desde += tamanoPaginaEstudiantes) {
    const { data, error } = await supabase
      .from("estudiantes")
      .select("codigo_hik, codigo, apellidos, nombres, seccion, curso, paralelo, estado")
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

  const eventosSoloEstudiantes = eventos.flatMap(evento => {
    const identificadores = [
      evento.personCode,
      evento.personId,
      evento.employeeNo,
      evento.employeeNoString,
      evento.personInfo?.personCode,
      evento.personInfo?.personId
    ].map(normalizarIdentificador).filter(Boolean);
    const estudiante = identificadores.map(id => estudiantePorCodigoHik.get(id)).find(Boolean);
    if (!estudiante) return [];
    const nombreEstudiante = [estudiante.apellidos, estudiante.nombres].filter(Boolean).join(" ").trim();
    return [{
      ...evento,
      personName: nombreEstudiante || evento.personName || evento.name || "Estudiante",
      studentId: estudiante.id,
      studentCode: estudiante.codigo || "",
      studentHikCode: estudiante.codigo_hik,
      studentSection: estudiante.seccion || "",
      studentCourse: estudiante.curso || "",
      studentParallel: estudiante.paralelo || ""
    }];
  });

  console.log("[Dashboard] Filtro Supabase aplicado:", JSON.stringify({
    estudiantesActivosConCodigoHik: estudiantePorCodigoHik.size,
    eventosHikCentral: eventos.length,
    eventosDeEstudiantes: eventosSoloEstudiantes.length
  }));

  // A partir de aquí se trabaja solo con eventos que coinciden con estudiantes de Supabase.
  eventos.length = 0;
  eventos.push(...eventosSoloEstudiantes);

  // Algunos modelos de HikCentral no incluyen personName en el evento.
  // Resolver los personId disponibles mediante el endpoint de detalle de persona.
  const personIdInfoPath = "/artemis/api/resource/v1/person/personId/personInfo";
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
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(texto)) texto = texto.replace(" ", "T") + "-05:00";
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(texto)) texto += "-05:00";
    const fecha = new Date(texto);
    return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
  };
  const filasEventos = eventosConNombre.flatMap(evento => {
    const fechaRaw = evento.eventTime || evento.swipeTime || evento.time || evento.eventDate || evento.dateTime || evento.occurTime;
    const fechaEvento = normalizarFechaEvento(fechaRaw);
    const codigoHik = String(evento.studentHikCode || evento.personCode || evento.personInfo?.personCode || evento.employeeNo || evento.employeeNoString || evento.personId || evento.personInfo?.personId || "").trim();
    if (!fechaEvento || !codigoHik || !evento.studentId) return [];
    const puertaCodigo = String(evento.doorIndexCode || evento.doorCode || evento.doorNo || "");
    const puertaNombre = String(evento.doorName || evento.devName || evento.readerName || evento.srcName || evento.deviceName || "");
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
  return { fechaInicio: inicio, fechaFin: fin, totalEventos: eventosConNombre.length, eventosGuardados: filasEventos.length, eventos: eventosConNombre };
}
