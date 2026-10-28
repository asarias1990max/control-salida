import crypto from "crypto";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const HIK_BASE_URL = process.env.HIK_BASE_URL;
const HIK_APP_KEY = process.env.HIK_APP_KEY;
const HIK_APP_SECRET = process.env.HIK_APP_SECRET;

const ADD_PERSONS_PATH = "/artemis/api/acs/v1/privilege/group/single/addPersons";
const ACCESS_LEVELS_PATH = "/artemis/api/acs/v1/privilege/group";

function generarFirma(method, path, timestamp, nonce) {
  const stringToSign =
    method + "\n" +
    "*/*\n" +
    "application/json\n" +
    "x-ca-key:" + HIK_APP_KEY + "\n" +
    "x-ca-nonce:" + nonce + "\n" +
    "x-ca-timestamp:" + timestamp + "\n" +
    path;

  console.log("STRING TO SIGN HIK:\n" + stringToSign);

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

  const response = await axios.post(url, body, {
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

  return response.data;
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
      throw new Error("HikCentral no pudo listar los niveles de acceso: " + (result?.msg || "respuesta no válida"));
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
