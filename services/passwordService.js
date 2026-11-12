import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const COSTE_N = 16384;
const BLOQUE_R = 8;
const PARALELISMO_P = 1;
const LONGITUD_HASH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

export async function crearHashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, LONGITUD_HASH, {
    N: COSTE_N, r: BLOQUE_R, p: PARALELISMO_P, maxmem: MAX_MEMORY
  });
  return ["scrypt", COSTE_N, BLOQUE_R, PARALELISMO_P, salt.toString("base64url"), Buffer.from(hash).toString("base64url")].join("$");
}

export async function verificarPassword(password, almacenado) {
  if (typeof almacenado !== "string") return false;
  const partes = almacenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, saltTexto, hashTexto] = partes;
  if (Number(n) !== COSTE_N || Number(r) !== BLOQUE_R || Number(p) !== PARALELISMO_P) return false;
  try {
    const salt = Buffer.from(saltTexto, "base64url");
    const hashEsperado = Buffer.from(hashTexto, "base64url");
    if (salt.length !== 16 || hashEsperado.length !== LONGITUD_HASH) return false;
    const hashCalculado = await scryptAsync(password, salt, LONGITUD_HASH, {
      N: COSTE_N, r: BLOQUE_R, p: PARALELISMO_P, maxmem: MAX_MEMORY
    });
    return crypto.timingSafeEqual(Buffer.from(hashCalculado), hashEsperado);
  } catch {
    return false;
  }
}
