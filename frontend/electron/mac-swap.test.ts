import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Prove dello scambio di mac-swap.sh con app finte: girano su macOS e su Linux (su GitHub
// Actions anche sui due Mac), non su Windows. Il comando che apre l'app è sostituito da uno
// che avvia direttamente il suo eseguibile, così la prova non dipende dal Finder.

const run = promisify(execFile);
const SCRIPT = join(__dirname, "mac-swap.sh");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "scambio-mac-"));
});

afterEach(async () => {
  // Chiude le app finte avviate dalla prova
  await run("pkill", ["-f", dir]).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

/** App finta: un eseguibile che resta aperto (o si chiude subito) e la sua versione. */
async function fakeApp(where: string, version: string, { starts = true } = {}) {
  const app = join(dir, where, "Prova.app");
  await mkdir(join(app, "Contents", "MacOS"), { recursive: true });
  const executable = join(app, "Contents", "MacOS", "prova");
  await writeFile(executable, starts ? "#!/bin/bash\nsleep 60\n" : "#!/bin/bash\nexit 1\n");
  await chmod(executable, 0o755);
  await writeFile(join(app, "versione"), version);
  return app;
}

async function opener() {
  const file = join(dir, "apri.sh");
  await writeFile(file, '#!/bin/bash\n"$1/Contents/MacOS/prova" > /dev/null 2>&1 &\necho "aperta $1" >> "$(dirname "$0")/aperture.txt"\n');
  await chmod(file, 0o755);
  return file;
}

/** Processo già terminato: lo scambio non deve aspettare. */
async function finishedPid() {
  const child = spawn("true");
  await new Promise((resolve) => child.on("exit", resolve));
  return String(child.pid);
}

async function swap({ pid, relaunch, newApp }: { pid?: string; relaunch: boolean; newApp: string }) {
  const app = join(dir, "Applicazioni", "Prova.app");
  const backup = join(dir, "Applicazioni", ".Prova.app-precedente");
  await run("/bin/bash", [
    SCRIPT,
    pid ?? (await finishedPid()),
    app,
    newApp,
    backup,
    relaunch ? "1" : "0",
    join(dir, "aggiornamento.log"),
    join(dir, "esito.txt"),
    await opener(),
  ]).catch(() => {});
  return {
    version: await readFile(join(app, "versione"), "utf-8"),
    backupExists: existsSync(backup),
    result: (await readFile(join(dir, "esito.txt"), "utf-8")).trim(),
    log: await readFile(join(dir, "aggiornamento.log"), "utf-8"),
    openings: existsSync(join(dir, "aperture.txt")) ? (await readFile(join(dir, "aperture.txt"), "utf-8")).trim().split("\n") : [],
  };
}

describe.skipIf(process.platform === "win32")("scambio dell'app su macOS", () => {
  it("alla chiusura mette la versione nuova al suo posto e tiene da parte la precedente", async () => {
    await fakeApp("Applicazioni", "1.2.0");
    const newApp = await fakeApp("nuova", "1.2.1");

    const outcome = await swap({ relaunch: false, newApp });

    expect(outcome).toMatchObject({ version: "1.2.1", backupExists: true, result: "ok", openings: [] });
    expect(outcome.log).toContain("aggiornamento completato");
    expect(existsSync(newApp)).toBe(false);
  });

  it("con «Riavvia ora» riapre la versione nuova e, partita, elimina la precedente", async () => {
    await fakeApp("Applicazioni", "1.2.0");
    const newApp = await fakeApp("nuova", "1.2.1");

    const outcome = await swap({ relaunch: true, newApp });

    expect(outcome).toMatchObject({ version: "1.2.1", backupExists: false, result: "ok" });
    expect(outcome.openings).toHaveLength(1);
    expect(outcome.log).toContain("versione nuova avviata");
  }, 30_000);

  it("se la versione nuova non parte rimette e riapre la precedente", async () => {
    await fakeApp("Applicazioni", "1.2.0");
    const newApp = await fakeApp("nuova", "1.2.1", { starts: false });

    const outcome = await swap({ relaunch: true, newApp });

    expect(outcome.version).toBe("1.2.0");
    expect(outcome.result).toBe("errore: la versione nuova non si è avviata; è tornata quella precedente");
    expect(outcome.openings).toHaveLength(2);
    expect(outcome.backupExists).toBe(false);
  }, 40_000);

  it("se non riesce a mettere al suo posto la versione nuova rimette la precedente", async () => {
    await fakeApp("Applicazioni", "1.2.0");

    const outcome = await swap({ relaunch: false, newApp: join(dir, "nuova", "mancante.app") });

    expect(outcome.version).toBe("1.2.0");
    expect(outcome.result).toContain("errore: non è stato possibile mettere al suo posto la versione nuova");
    expect(outcome.backupExists).toBe(false);
  });

  it("aspetta che l'app sia chiusa prima di toccarla", async () => {
    await fakeApp("Applicazioni", "1.2.0");
    const newApp = await fakeApp("nuova", "1.2.1");
    const stillOpen = spawn("sleep", ["1.5"]);
    const started = Date.now();

    const outcome = await swap({ pid: String(stillOpen.pid), relaunch: false, newApp });

    expect(Date.now() - started).toBeGreaterThanOrEqual(1000);
    expect(outcome.version).toBe("1.2.1");
    expect(outcome.log).toContain(`attesa della chiusura dell'app (processo ${stillOpen.pid})`);
  });
});
