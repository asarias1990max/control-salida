import crypto from "crypto";
import axios from "axios";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const HIK_BASE_URL = process.env.HIK_BASE_URL;
const HIK_APP_KEY = process.env.HIK_APP_KEY;
const HIK_APP_SECRET = process.env.HIK_APP_SECRET;

const ADD_PERSONS_PATH = "/artemis/api/acs/v1/privilege/group/single/addPersons";

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