// Cifratura di un segreto (la chiave API) con una master password: AES-256-GCM, con la chiave
// di cifratura ricavata dalla password con scrypt. La password non viene mai salvata: senza
// di essa il segreto non si può leggere, e GCM si accorge di un file modificato.

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

// Formato del record cifrato: permette in futuro di cambiare algoritmo o parametri
const FORMAT_VERSION = 1;
// Parametri di scrypt raccomandati da OWASP: ogni tentativo richiede 128 MB di memoria e
// qualche decimo di secondo, così provare password a caso diventa molto lento
const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1 };
// Limiti ai parametri letti dal file: un file modificato non deve bloccare l'app
const MAX_N = 2 ** 20;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

class WrongPasswordError extends Error {
  constructor() {
    super("Master password errata");
    this.name = "WrongPasswordError";
  }
}

class UnreadableSecretError extends Error {
  constructor() {
    super("Il segreto salvato è in un formato non riconosciuto");
    this.name = "UnreadableSecretError";
  }
}

function deriveKey(password, salt, { N, r, p }) {
  // La stessa password scritta su sistemi diversi può avere accenti codificati in modo diverso
  return scrypt(password.normalize("NFC"), salt, KEY_BYTES, { N, r, p, maxmem: 256 * N * r });
}

// I parametri di scrypt fanno parte dei dati autenticati: cambiarli nel file rende il record
// illeggibile invece di indebolirlo
function associatedData({ N, r, p }) {
  return Buffer.from(`v${FORMAT_VERSION}:scrypt:${N}:${r}:${p}`, "utf-8");
}

/** Cifra `plaintext` con `password`. Sale e vettore iniziale sono casuali a ogni chiamata:
 *  lo stesso segreto cifrato due volte dà record diversi. */
async function encryptWithPassword(plaintext, password, params = SCRYPT_PARAMS) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = await deriveKey(password, salt, params);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(params));
  const data = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return {
    version: FORMAT_VERSION,
    kdf: "scrypt",
    N: params.N,
    r: params.r,
    p: params.p,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function bytes(value, length) {
  if (typeof value !== "string") return null;
  const buffer = Buffer.from(value, "base64");
  return length === undefined || buffer.length === length ? buffer : null;
}

/** Parametri e dati del record, controllati; UnreadableSecretError se qualcosa non va. */
function parseRecord(record) {
  const { version, kdf, N, r, p } = record ?? {};
  const params = { N, r, p };
  const validParams =
    Number.isInteger(N) && N > 1 && N <= MAX_N && (N & (N - 1)) === 0 &&
    Number.isInteger(r) && r >= 1 && r <= 32 &&
    Number.isInteger(p) && p >= 1 && p <= 16;
  const salt = bytes(record?.salt, SALT_BYTES);
  const iv = bytes(record?.iv, IV_BYTES);
  const tag = bytes(record?.tag, TAG_BYTES);
  const data = bytes(record?.data);
  if (version !== FORMAT_VERSION || kdf !== "scrypt" || !validParams || !salt || !iv || !tag || !data) {
    throw new UnreadableSecretError();
  }
  return { params, salt, iv, tag, data };
}

/** Decifra un record di encryptWithPassword. Password sbagliata o record modificato:
 *  WrongPasswordError (con GCM i due casi non si distinguono). */
async function decryptWithPassword(record, password) {
  const { params, salt, iv, tag, data } = parseRecord(record);
  const key = await deriveKey(password, salt, params);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(associatedData(params));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
  } catch {
    throw new WrongPasswordError();
  }
}

module.exports = {
  SCRYPT_PARAMS,
  UnreadableSecretError,
  WrongPasswordError,
  decryptWithPassword,
  encryptWithPassword,
};
