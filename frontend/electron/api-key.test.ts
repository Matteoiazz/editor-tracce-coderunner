import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KEY_FILE, createApiKeyStore, maskKey } from "./api-key.cjs";
import { API_URL } from "./openrouter.cjs";

const KEY = "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab";
const OTHER_KEY = "sk-or-v1-ffffffffffffffffffffffffffffffffffffffffffffffffffffffff3f9a";
const FAST = { N: 2 ** 10, r: 8, p: 1 };

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "chiave-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Portachiavi finto: "cifra" invertendo il testo, così il file non contiene la chiave in chiaro
function fakeKeychain({ weak = false, broken = false } = {}) {
  const reverse = (text: string) => [...text].reverse().join("");
  return {
    weak,
    encrypt: (text: string) => Buffer.from(`portachiavi:${reverse(text)}`),
    decrypt: (data: Buffer) => {
      if (broken) throw new Error("accesso negato");
      return reverse(data.toString().replace(/^portachiavi:/, ""));
    },
  };
}

function openRouter() {
  const keys: string[] = [];
  const fetch = async (_url: string, init: RequestInit) => {
    keys.push((init.headers as Record<string, string>).Authorization);
    return new Response(JSON.stringify({ data: { usage: 0 } }));
  };
  return { fetch, keys };
}

function store(options: { keychain?: ReturnType<typeof fakeKeychain>; fetch?: typeof fetch } = {}) {
  return createApiKeyStore(dir, {
    keychain: options.keychain ?? fakeKeychain(),
    fetch: options.fetch ?? openRouter().fetch,
    scryptParams: FAST,
  });
}

const fileText = () => readFile(join(dir, KEY_FILE), "utf-8");

describe("chiave senza master password", () => {
  it("senza file non c'è nessuna chiave", async () => {
    expect(await store().status()).toEqual({
      saved: false,
      mask: null,
      protected: false,
      unlocked: false,
      weakKeychain: false,
      problem: null,
    });
  });

  it("si salva nel portachiavi, mascherata, e si rilegge", async () => {
    const status = await store().save(`  ${KEY}\n`);

    expect(status).toMatchObject({ saved: true, mask: "sk-or-v1-••••89ab", protected: false });
    expect(await fileText()).not.toContain("0123456789abcdef");
    expect(await store().reveal()).toBe(KEY);
  });

  it.skipIf(process.platform === "win32")("è leggibile solo dall'utente", async () => {
    await store().save(KEY);

    expect((await stat(join(dir, KEY_FILE))).mode & 0o777).toBe(0o600);
  });

  it("rifiuta un testo che non può essere una chiave", async () => {
    await expect(store().save("sk-or-v1-corta")).rejects.toThrow("Non sembra una chiave");
    await expect(store().save("sk-or-v1-0123456789 abcdef0123456789")).rejects.toThrow("senza spazi");
    expect(await readdir(dir)).toEqual([]);
  });

  it("segnala un portachiavi debole e uno che non restituisce la chiave", async () => {
    expect((await store({ keychain: fakeKeychain({ weak: true }) }).status()).weakKeychain).toBe(true);

    await store().save(KEY);
    await expect(store({ keychain: fakeKeychain({ broken: true }) }).reveal()).rejects.toThrow(
      "Il portachiavi del sistema non ha restituito la chiave",
    );
  });

  it("si sostituisce e si rimuove", async () => {
    const keys = store();
    await keys.save(KEY);

    expect((await keys.save(OTHER_KEY)).mask).toBe("sk-or-v1-••••3f9a");
    expect(await keys.reveal()).toBe(OTHER_KEY);
    expect((await keys.remove()).saved).toBe(false);
    expect(await readdir(dir)).toEqual([]);
    await expect(keys.reveal()).rejects.toThrow("Nessuna chiave salvata");
  });
});

describe("chiave protetta da master password", () => {
  it("richiede una master password di almeno 8 caratteri", async () => {
    await expect(store().save(KEY, "corta")).rejects.toThrow("almeno 8 caratteri");
    expect(await readdir(dir)).toEqual([]);
  });

  it("dopo il salvataggio è sbloccata; a un nuovo avvio è bloccata", async () => {
    expect(await store().save(KEY, "password lunga")).toMatchObject({ protected: true, unlocked: true });
    expect(await fileText()).not.toContain("0123456789abcdef");

    expect(await store().status()).toMatchObject({ saved: true, mask: "sk-or-v1-••••89ab", protected: true, unlocked: false });
  });

  it("si mostra solo con la master password giusta, anche se è sbloccata", async () => {
    const keys = store();
    await keys.save(KEY, "password lunga");

    await expect(keys.reveal()).rejects.toThrow("Serve la master password");
    await expect(keys.reveal("password sbagliata")).rejects.toThrow("Master password errata");
    expect(await keys.reveal("password lunga")).toBe(KEY);
  });

  it("si sblocca per la sessione e si blocca", async () => {
    const keys = store();
    await keys.save(KEY, "password lunga");
    const restarted = store();

    await expect(restarted.unlock("password sbagliata")).rejects.toThrow("Master password errata");
    expect((await restarted.unlock("password lunga")).unlocked).toBe(true);
    expect((await restarted.lock()).unlocked).toBe(false);
  });

  it("passa dal portachiavi alla master password e ritorno", async () => {
    const keys = store();
    await keys.save(KEY);

    expect(await keys.protect("password lunga")).toMatchObject({ protected: true, unlocked: true });
    expect(JSON.parse(await fileText()).protection).toBe("password");

    await expect(keys.unprotect("password sbagliata")).rejects.toThrow("Master password errata");
    expect(JSON.parse(await fileText()).protection).toBe("password");
    expect(await keys.unprotect("password lunga")).toMatchObject({ protected: false, unlocked: false });
    expect(await keys.reveal()).toBe(KEY);
  });

  it("cambia la master password", async () => {
    const keys = store();
    await keys.save(KEY, "password vecchia");
    const before = await fileText();

    await expect(keys.changePassword("password errata", "password nuova")).rejects.toThrow("errata");
    await expect(keys.changePassword("password vecchia", "corta")).rejects.toThrow("almeno 8");
    expect(await fileText()).toBe(before);

    await keys.changePassword("password vecchia", "password nuova");
    await expect(store().reveal("password vecchia")).rejects.toThrow("Master password errata");
    expect(await store().reveal("password nuova")).toBe(KEY);
  });

  it("le operazioni sulla protezione richiedono lo stato giusto", async () => {
    const keys = store();
    await keys.save(KEY);
    await expect(keys.unlock("password lunga")).rejects.toThrow("non è protetta");
    await keys.protect("password lunga");
    await expect(keys.protect("altra password")).rejects.toThrow("già protetta");
  });

  it("dimenticata la password, si può solo rimuovere la chiave e inserirne una nuova", async () => {
    await store().save(KEY, "password lunga");
    const keys = store();

    expect((await keys.remove()).saved).toBe(false);
    expect((await keys.save(OTHER_KEY)).mask).toBe("sk-or-v1-••••3f9a");
  });
});

describe("prova della chiave", () => {
  it("usa la chiave salvata, presentata solo a OpenRouter", async () => {
    const { fetch, keys } = openRouter();
    const apiKeys = store({ fetch });
    await apiKeys.save(KEY);

    expect(await apiKeys.test()).toMatchObject({ outcome: "valid" });
    expect(keys).toEqual([`Bearer ${KEY}`]);
  });

  it("con la chiave protetta e bloccata serve la master password, che la sblocca", async () => {
    await store().save(KEY, "password lunga");
    const { fetch, keys } = openRouter();
    const apiKeys = store({ fetch });

    await expect(apiKeys.test()).rejects.toThrow("Serve la master password");
    expect(await apiKeys.test("password lunga")).toMatchObject({ outcome: "valid" });
    expect((await apiKeys.status()).unlocked).toBe(true);
    // Sbloccata, la prova successiva non chiede più la password
    expect(await apiKeys.test()).toMatchObject({ outcome: "valid" });
    expect(keys).toHaveLength(2);
  });
});

describe("chiave per le richieste AI", () => {
  it("senza chiave salvata dice di inserirla", async () => {
    await expect(store().use()).rejects.toThrow("inseriscila nelle Impostazioni");
  });

  it("dal portachiavi, senza password", async () => {
    const keys = store();
    await keys.save(KEY);
    expect(await keys.use()).toBe(KEY);
  });

  it("protetta: solo se sbloccata, senza mai chiedere la password", async () => {
    await store().save(KEY, "password lunga");
    const keys = store();

    await expect(keys.use()).rejects.toThrow("sbloccala nelle Impostazioni");
    await keys.unlock("password lunga");
    expect(await keys.use()).toBe(KEY);
    await keys.lock();
    await expect(keys.use()).rejects.toThrow("sbloccala nelle Impostazioni");
  });
});

describe("file della chiave illeggibile", () => {
  it("viene segnalato e si può rimuovere", async () => {
    await writeFile(join(dir, KEY_FILE), "{rovinato");
    const keys = store();

    expect(await keys.status()).toMatchObject({ saved: true, mask: null, problem: expect.stringContaining("illeggibile") });
    await expect(keys.reveal()).rejects.toThrow("illeggibile");
    expect((await keys.remove()).saved).toBe(false);
  });

  it("con il record cifrato rovinato non si sblocca", async () => {
    await store().save(KEY, "password lunga");
    const record = JSON.parse(await fileText());
    await writeFile(join(dir, KEY_FILE), JSON.stringify({ ...record, secret: { ...record.secret, version: 9 } }));

    await expect(store().unlock("password lunga")).rejects.toThrow("illeggibile");
  });
});

describe("forma mascherata", () => {
  it("mostra l'inizio e gli ultimi quattro caratteri", () => {
    expect(maskKey(OTHER_KEY)).toBe("sk-or-v1-••••3f9a");
    expect(maskKey("abcdefghijklmnopqrstuvwxyz")).toBe("abc••••wxyz");
  });
});

describe("indirizzo della prova", () => {
  it("è quello dei dati della chiave", async () => {
    const urls: string[] = [];
    const apiKeys = store({
      fetch: async (url: string) => {
        urls.push(url);
        return new Response("{}");
      },
    });
    await apiKeys.save(KEY);
    await apiKeys.test();

    expect(urls).toEqual([`${API_URL}/key`]);
  });
});
