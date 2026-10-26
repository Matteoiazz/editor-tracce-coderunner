import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MacUpdater,
  RESULT_FILE,
  backupPath,
  bundleLocationProblem,
  compareVersions,
  parseUpdateInfo,
  previousUpdateOutcome,
} from "./mac-updater.cjs";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aggiornatore-mac-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sha512 = (data: Buffer) => createHash("sha512").update(data).digest("base64");

// File della versione come lo crea electron-builder per un Mac Apple Silicon
function metadata(version: string, zip: Buffer, name = `Editor-tracce-CodeRunner-${version}-arm64.zip`) {
  return [
    `version: ${version}`,
    "files:",
    `  - url: ${name}`,
    `    sha512: ${sha512(zip)}`,
    `    size: ${zip.length}`,
    `  - url: Editor-tracce-CodeRunner-${version}-arm64.dmg`,
    "    sha512: AAAA",
    "    size: 10",
    `path: ${name}`,
    `sha512: ${sha512(zip)}`,
    "releaseDate: '2026-10-26T10:00:00.000Z'",
  ].join("\n");
}

describe("confronto delle versioni", () => {
  it.each([
    ["1.2.1", "1.2.0", 1],
    ["1.2.0", "1.2.0", 0],
    ["1.10.0", "1.9.9", 1],
    ["1.2", "1.2.0", 0],
    ["v1.3.0", "1.2.9", 1],
    ["1.2.0-beta.1", "1.2.0", -1],
    ["1.2.0", "1.1.9-beta", 1],
  ])("%s rispetto a %s", (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});

describe("file della versione", () => {
  it("dà la versione e lo .zip, non il .dmg", () => {
    const zip = Buffer.from("app");

    expect(parseUpdateInfo(metadata("1.2.1", zip))).toEqual({
      version: "1.2.1",
      file: { name: "Editor-tracce-CodeRunner-1.2.1-arm64.zip", sha512: sha512(zip), size: 3 },
    });
  });

  it.each([
    ["testo non YAML", "version: [1"],
    ["senza .zip", "version: 1.2.1\nfiles:\n  - url: a.dmg\n    sha512: x"],
    ["senza versione", "files:\n  - url: a.zip\n    sha512: x"],
    ["con un percorso al posto del nome", "version: 1.2.1\nfiles:\n  - url: ../a.zip\n    sha512: x"],
  ])("rifiuta un file %s", (_case, text) => {
    expect(() => parseUpdateInfo(text)).toThrow("non riconosciuto");
  });
});

describe("posizione dell'app", () => {
  const writable = () => true;
  const readOnly = () => false;

  it("nella cartella Applicazioni, scrivibile, si aggiorna", () => {
    expect(bundleLocationProblem("/Applications/Editor tracce CodeRunner.app", writable)).toBeNull();
  });

  it("spiega perché non si aggiorna da sola", () => {
    expect(
      bundleLocationProblem("/private/var/folders/xy/T/AppTranslocation/1234/d/Editor tracce CodeRunner.app", writable),
    ).toContain("trascinala nella cartella Applicazioni");
    expect(bundleLocationProblem("/Volumes/Editor tracce CodeRunner/Editor tracce CodeRunner.app", readOnly)).toContain(
      "disco del .dmg",
    );
    expect(bundleLocationProblem("/Applications/Editor tracce CodeRunner.app", readOnly)).toContain("permessi");
  });

  it("tiene da parte la versione precedente accanto all'app, nascosta", () => {
    expect(backupPath("/Applications/Editor tracce CodeRunner.app")).toBe(
      join("/Applications", ".Editor tracce CodeRunner.app-precedente"),
    );
  });
});

/** Aggiornatore con rete e strumenti di macOS finti. */
function updater({
  version = "1.2.1",
  zip = Buffer.from("contenuto dello zip"),
  info = metadata(version, zip),
  status = 200,
  plist = { version, id: "it.unical.editor-tracce-coderunner" },
  signatureValid = true,
} = {}) {
  const urls: string[] = [];
  const commands: string[] = [];
  const launched: string[][] = [];
  const quitListeners: (() => void)[] = [];
  let quits = 0;
  const bundle = join(dir, "Applications", "Editor tracce CodeRunner.app");
  const mac = new MacUpdater({
    bundle,
    currentVersion: "1.2.0",
    feed: {
      metadataUrl: "https://example.test/latest-mac-arm64.yml",
      fileUrl: (v: string, name: string) => `https://example.test/v${v}/${name}`,
    },
    cacheDir: join(dir, "cache"),
    dataDir: join(dir, "dati"),
    fetch: async (url: string) => {
      urls.push(url);
      if (status !== 200) return new Response("non trovato", { status });
      return new Response(url.endsWith(".yml") ? info : zip);
    },
    run: async (file: string, args: string[]) => {
      commands.push(file.split("/").pop()!);
      if (file.endsWith("ditto")) await mkdir(join(args[3], "Editor tracce CodeRunner.app", "Contents"), { recursive: true });
      if (file.endsWith("PlistBuddy")) {
        const fromNew = args[2].includes(join("cache", "nuova"));
        if (args[1].includes("CFBundleShortVersionString")) return `${fromNew ? plist.version : "1.2.0"}\n`;
        return `${fromNew ? plist.id : "it.unical.editor-tracce-coderunner"}\n`;
      }
      if (file.endsWith("codesign") && !signatureValid) throw new Error("codesign: invalid signature");
      return "";
    },
    launch: (file: string, args: string[]) => launched.push([file, ...args]),
    quit: () => quits++,
    onQuit: (listener: () => void) => quitListeners.push(listener),
    pid: 4242,
    swapScript: join(__dirname, "mac-swap.sh"),
  });
  const events: string[] = [];
  for (const name of ["checking-for-update", "update-available", "update-not-available", "download-progress", "update-downloaded", "error"]) {
    mac.on(name, () => events.push(name));
  }
  return { mac, urls, commands, launched, quitListeners, events, quits: () => quits, bundle };
}

describe("controllo e download su macOS", () => {
  it("scarica la versione nuova, la estrae e la controlla", async () => {
    const { mac, urls, commands, events } = updater();

    await mac.checkForUpdates();

    expect(urls).toEqual([
      "https://example.test/latest-mac-arm64.yml",
      "https://example.test/v1.2.1/Editor-tracce-CodeRunner-1.2.1-arm64.zip",
    ]);
    expect(commands).toEqual(["ditto", "PlistBuddy", "PlistBuddy", "PlistBuddy", "codesign"]);
    expect(events[0]).toBe("checking-for-update");
    expect(events).toContain("download-progress");
    expect(events.at(-1)).toBe("update-downloaded");
    expect(mac.ready).toEqual({ version: "1.2.1", app: join(dir, "cache", "nuova", "Editor tracce CodeRunner.app") });
    // Lo .zip non serve più dopo l'estrazione
    expect(existsSync(join(dir, "cache", "Editor-tracce-CodeRunner-1.2.1-arm64.zip"))).toBe(false);
  });

  it("con la stessa versione non scarica nulla", async () => {
    const { mac, urls, events } = updater({ version: "1.2.0" });

    await mac.checkForUpdates();

    expect(urls).toHaveLength(1);
    expect(events).toEqual(["checking-for-update", "update-not-available"]);
  });

  it("solo da segnalare: non scarica", async () => {
    const { mac, urls, events } = updater();
    mac.autoDownload = false;

    await mac.checkForUpdates();

    expect(urls).toHaveLength(1);
    expect(events).toEqual(["checking-for-update", "update-available"]);
  });

  it.each([
    ["impronta diversa", { info: metadata("1.2.1", Buffer.from("altro")) }, "sha512 checksum mismatch"],
    ["versione diversa da quella annunciata", { plist: { version: "1.2.2", id: "it.unical.editor-tracce-coderunner" } }, "è la versione 1.2.2 invece della 1.2.1"],
    ["un'altra applicazione", { plist: { version: "1.2.1", id: "com.esempio.altra" } }, "non è questa applicazione"],
    ["firma non valida", { signatureValid: false }, "La firma dell'app scaricata non è valida"],
    ["release senza il file", { status: 404 }, "HttpError: 404"],
  ])("rifiuta: %s", async (_case, options, message) => {
    const { mac, events } = updater(options);

    await expect(mac.checkForUpdates()).rejects.toThrow(message);
    expect(events.at(-1)).toBe("error");
    expect(mac.ready).toBeNull();
  });
});

describe("installazione su macOS", () => {
  it("«Riavvia ora» avvia lo scambio con la riapertura e chiude l'app", async () => {
    const { mac, launched, quits, bundle } = updater();
    await mac.checkForUpdates();

    mac.quitAndInstall(true, true);
    mac.quitAndInstall(true, true);

    expect(quits()).toBe(1);
    expect(launched).toHaveLength(1);
    const [shell, script, ...args] = launched[0];
    expect(shell).toBe("/bin/bash");
    expect(args).toEqual([
      "4242",
      bundle,
      join(dir, "cache", "nuova", "Editor tracce CodeRunner.app"),
      backupPath(bundle),
      "1",
      join(dir, "dati", "aggiornamento.log"),
      join(dir, "dati", RESULT_FILE),
      "/usr/bin/open",
    ]);
    // Lo script è copiato fuori dall'archivio dell'app, eseguibile e con le righe Unix
    const copy = await readFile(script, "utf-8");
    expect(copy.startsWith("#!/bin/bash\n")).toBe(true);
    expect(copy).not.toContain("\r");
    if (process.platform !== "win32") expect((await stat(script)).mode & 0o111).not.toBe(0);
  });

  it("alla chiusura installa senza riaprire, una volta sola", async () => {
    const { mac, launched, quitListeners } = updater();
    await mac.checkForUpdates();
    await mac.checkForUpdates();

    expect(quitListeners).toHaveLength(1);
    quitListeners[0]();
    quitListeners[0]();
    expect(launched).toHaveLength(1);
    expect(launched[0][6]).toBe("0");
  });

  it("senza versione pronta non fa nulla", () => {
    const { mac, launched, quits } = updater();

    mac.quitAndInstall(true, true);

    expect(launched).toHaveLength(0);
    expect(quits()).toBe(0);
  });
});

describe("al successivo avvio", () => {
  it("riporta un aggiornamento non riuscito e pulisce versione precedente e file scaricati", async () => {
    const bundle = join(dir, "Applications", "Editor tracce CodeRunner.app");
    const dataDir = join(dir, "dati");
    const cacheDir = join(dir, "cache");
    await mkdir(backupPath(bundle), { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, RESULT_FILE), "errore: la versione nuova non si è avviata\n");

    expect(await previousUpdateOutcome({ bundle, dataDir, cacheDir })).toBe("la versione nuova non si è avviata");
    expect(existsSync(join(dataDir, RESULT_FILE))).toBe(false);
    expect(existsSync(backupPath(bundle))).toBe(false);
    expect(existsSync(cacheDir)).toBe(false);
    // Già letto: non si ripete
    expect(await previousUpdateOutcome({ bundle, dataDir, cacheDir })).toBeNull();
  });

  it("un aggiornamento riuscito non lascia messaggi", async () => {
    const dataDir = join(dir, "dati");
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, RESULT_FILE), "ok\n");

    expect(
      await previousUpdateOutcome({ bundle: join(dir, "X.app"), dataDir, cacheDir: join(dir, "cache") }),
    ).toBeNull();
  });
});

// Con gli strumenti veri di macOS (solo sui Mac di GitHub Actions): ditto, PlistBuddy e codesign
// su una copia della Calcolatrice di sistema, un'app firmata vera
describe.runIf(process.platform === "darwin")("strumenti di macOS", () => {
  const calculator = "/System/Applications/Calculator.app";

  async function fixture(tamper: boolean) {
    const source = join(dir, "sorgente", "Calculator.app");
    execFileSync("/usr/bin/ditto", [calculator, source]);
    if (tamper) await writeFile(join(source, "Contents", "Resources", "aggiunto.txt"), "modificata");
    const zipPath = join(dir, "Calculator.zip");
    execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", source, zipPath]);
    const zip = await readFile(zipPath);
    const version = execFileSync("/usr/libexec/PlistBuddy", [
      "-c",
      "Print :CFBundleShortVersionString",
      join(calculator, "Contents", "Info.plist"),
    ])
      .toString()
      .trim();
    const mac = new MacUpdater({
      bundle: calculator,
      currentVersion: "0.0.1",
      feed: { metadataUrl: "https://example.test/latest.yml", fileUrl: (_v: string, name: string) => `https://example.test/${name}` },
      cacheDir: join(dir, "cache"),
      dataDir: join(dir, "dati"),
      fetch: async (url: string) => new Response(url.endsWith(".yml") ? metadata(version, zip, "Calculator.zip") : zip),
      quit: () => {},
      onQuit: () => {},
    });
    return mac;
  }

  it("estrae l'app e ne controlla versione, identificativo e firma", async () => {
    const mac = await fixture(false);

    await mac.checkForUpdates();

    expect(existsSync(join(mac.ready.app, "Contents", "Info.plist"))).toBe(true);
  }, 60_000);

  it("rifiuta un'app modificata dopo la firma", async () => {
    const mac = await fixture(true);

    await expect(mac.checkForUpdates()).rejects.toThrow("La firma dell'app scaricata non è valida");
  }, 60_000);
});
