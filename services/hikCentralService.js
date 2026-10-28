import crypto from "crypto";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const HIK_BASE_URL = process.env.HIK_BASE_URL;
const HIK_APP_KEY = process.env.HIK_APP_KEY;
const HIK_APP_SECRET = process.env.HIK_APP_SECRET;

const ADD_PERSONS_PATH = "/artemis/api/acs/v1/privilege/group/single/addPersons";
const ACCESS_DOORS_PATH = "/artemis/api/resource/v1/acsDoor/acsDoorList";
const ACCESS_LEVELS_PATH = "/artemis/api/acs/v1/privilege/group";
const ACCESS_LEVEL_PERSONS_PATH = "/artemis/api/acs/v1/privilege/group/single/personList";

function generarFirma(method, path, timestamp, nonce) {
  const stringToSign =
    method + "\n" +
    "*/*\n" +
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

export async function obtenerDashboardEventosHik(fechaInicio, fechaFin) {
  if (!HIK_BASE_URL || !HIK_APP_KEY || !HIK_APP_SECRET) throw new Error("Falta configurar HikCentral.");
  const now = new Date();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const inicio = fechaInicio || hoy;
  const fin = fechaFin || hoy;
  if (inicio > fin) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  // HikCentral requiere doorIndexCodes en la consulta de eventos. Obtener primero
  // los códigos reales de los puntos de acceso configurados, sin inventarlos.
  const puertas = [];
  let paginaPuertas = 1;
  let totalPuertas = Infinity;
  const tamanioPuertas = 500;
  while (puertas.length < totalPuertas) {
    const tsPuertas = Date.now().toString();
    const noncePuertas = crypto.randomUUID();
    const bodyPuertas = { pageNo: paginaPuertas, pageSize: tamanioPuertas };
    const firmaPuertas = generarFirma("POST", ACCESS_DOORS_PATH, tsPuertas, noncePuertas);
    const respPuertas = await axios.post(HIK_BASE_URL + ACCESS_DOORS_PATH, bodyPuertas, {
      httpsAgent, timeout: 30000,
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": tsPuertas, "X-Ca-Nonce": noncePuertas, "X-Ca-Signature": firmaPuertas, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" }
    });
    const resPuertas = respPuertas.data;
    if (!resPuertas || String(resPuertas.code) !== "0") {
      throw new Error("No se pudieron obtener los puntos de acceso de HikCentral: code=" + (resPuertas?.code ?? "sin código") + "; msg=" + (resPuertas?.msg || "respuesta no válida"));
    }
    const dataPuertas = resPuertas.data || {};
    const listaPuertas = Array.isArray(dataPuertas.list) ? dataPuertas.list : [];
    totalPuertas = Number(dataPuertas.total ?? listaPuertas.length);
    puertas.push(...listaPuertas);
    if (!listaPuertas.length || listaPuertas.length < tamanioPuertas || puertas.length >= totalPuertas) break;
    paginaPuertas++;
  }
  const doorIndexCodes = [...new Set(puertas.map(p => p.doorIndexCode).filter(v => v !== undefined && v !== null && String(v).trim() !== "").map(String))];
  if (!doorIndexCodes.length) throw new Error("HikCentral no devolvió códigos de puntos de acceso; no se puede consultar el historial de eventos.");

  console.log("[HikCentral] Puntos de acceso disponibles para eventos:", doorIndexCodes.length);

  const eventos = [];
  let pageNo = 1;
  let total = Infinity;
  const pageSize = 100;
  while (eventos.length < total) {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = { startTime: inicio + "T00:00:00-05:00", endTime: fin + "T23:59:59-05:00", eventType: 197151, doorIndexCodes, pageNo, pageSize, temperatureStatus: -1, maskStatus: -1 };
    const signature = generarFirma("POST", DOOR_EVENTS_PATH, timestamp, nonce);
    const response = await axios.post(HIK_BASE_URL + DOOR_EVENTS_PATH, body, { httpsAgent, timeout: 30000, headers: { "Content-Type": "application/json", "Accept": "application/json", "X-Ca-Key": HIK_APP_KEY, "X-Ca-Timestamp": timestamp, "X-Ca-Nonce": nonce, "X-Ca-Signature": signature, "X-Ca-Signature-Headers": "x-ca-key,x-ca-nonce,x-ca-timestamp" } });
    const result = response.data;
    if (!result || String(result.code) !== "0") throw new Error("HikCentral rechazó los eventos: code=" + (result?.code ?? "sin código") + "; msg=" + (result?.msg || "respuesta no válida"));
    const data = result.data || {};
    const list = Array.isArray(data.list) ? data.list : [];
    if (pageNo === 1) console.log("[HikCentral] door/events estructura:", JSON.stringify({ dataKeys: Object.keys(data), listLength: list.length, firstEventKeys: list[0] ? Object.keys(list[0]) : [] }));
    total = Number(data.total ?? list.length);
    eventos.push(...list);
    if (!list.length || list.length < pageSize || eventos.length >= total) break;
    pageNo++;
  }
  return { fechaInicio: inicio, fechaFin: fin, totalEventos: eventos.length, eventos };
}
