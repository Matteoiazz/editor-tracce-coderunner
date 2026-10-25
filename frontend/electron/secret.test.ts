import { describe, expect, it } from "vitest";
import {
  SCRYPT_PARAMS,
  UnreadableSecretError,
  WrongPasswordError,
  decryptWithPassword,
  encryptWithPassword,
} from "./secret.cjs";

// Parametri leggeri per i test; quelli veri si provano una volta sola
const FAST = { N: 2 ** 10, r: 8, p: 1 };
const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";

describe("cifratura con la master password", () => {
  it("decifra con la password giusta, anche con i parametri reali", async () => {
    const record = await encryptWithPassword(KEY, "password lunga", SCRYPT_PARAMS);

    expect(record).toMatchObject({ version: 1, kdf: "scrypt", N: 2 ** 17, r: 8, p: 1 });
    expect(await decryptWithPassword(record, "password lunga")).toBe(KEY);
  });

  it("non contiene il segreto in chiaro né la password", async () => {
    const text = JSON.stringify(await encryptWithPassword(KEY, "password lunga", FAST));

    expect(text).not.toContain("0123456789abcdef");
    expect(text).not.toContain("password lunga");
  });

  it("rifiuta una password sbagliata", async () => {
    const record = await encryptWithPassword(KEY, "password lunga", FAST);

    await expect(decryptWithPassword(record, "password lungA")).rejects.toThrow(WrongPasswordError);
    await expect(decryptWithPassword(record, "")).rejects.toThrow("Master password errata");
  });

  it("dà record diversi cifrando due volte lo stesso segreto", async () => {
    const a = await encryptWithPassword(KEY, "password lunga", FAST);
    const b = await encryptWithPassword(KEY, "password lunga", FAST);

    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("riconosce la stessa password scritta con accenti codificati in modo diverso", async () => {
    const record = await encryptWithPassword(KEY, "perché sì".normalize("NFC"), FAST);

    expect(await decryptWithPassword(record, "perché sì".normalize("NFD"))).toBe(KEY);
  });
});

describe("record modificato", () => {
  const flip = (base64: string) => {
    const bytes = Buffer.from(base64, "base64");
    bytes[0] ^= 1;
    return bytes.toString("base64");
  };

  it.each(["data", "tag", "iv", "salt"] as const)("con %s cambiato viene rifiutato", async (field) => {
    const record = await encryptWithPassword(KEY, "password lunga", FAST);

    await expect(
      decryptWithPassword({ ...record, [field]: flip(record[field]) }, "password lunga"),
    ).rejects.toThrow(WrongPasswordError);
  });

  it("con i parametri di scrypt cambiati viene rifiutato", async () => {
    const record = await encryptWithPassword(KEY, "password lunga", FAST);

    await expect(decryptWithPassword({ ...record, r: 4 }, "password lunga")).rejects.toThrow(
      WrongPasswordError,
    );
  });

  it.each([
    ["versione sconosciuta", { version: 2 }],
    ["N non potenza di 2", { N: 1000 }],
    ["N enorme", { N: 2 ** 30 }],
    ["sale troppo corto", { salt: Buffer.alloc(4).toString("base64") }],
    ["dati mancanti", { data: undefined }],
  ])("con %s è illeggibile", async (_case, change) => {
    const record = await encryptWithPassword(KEY, "password lunga", FAST);

    await expect(decryptWithPassword({ ...record, ...change }, "password lunga")).rejects.toThrow(
      UnreadableSecretError,
    );
  });

  it("che non è un oggetto è illeggibile", async () => {
    await expect(decryptWithPassword(null, "password lunga")).rejects.toThrow(UnreadableSecretError);
  });
});
