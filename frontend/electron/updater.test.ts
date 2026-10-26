import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
  CHECK_INTERVAL_MS,
  FIRST_CHECK_DELAY_MS,
  createUpdateController,
  updateErrorMessage,
} from "./updater.cjs";

const NOW = new Date("2026-10-25T10:00:00Z");
const RELEASES = "https://github.com/Matteoiazz/editor-tracce-coderunner/releases/latest";

/** Sostituto di electron-updater: a ogni controllo emette gli eventi indicati. */
class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checks = 0;
  installed: [boolean, boolean] | null = null;
  next: (updater: FakeUpdater) => void | Promise<void> = (u) => {
    u.emit("checking-for-update");
    u.emit("update-not-available", { version: "1.2.0" });
  };

  async checkForUpdates() {
    this.checks++;
    await this.next(this);
  }

  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean) {
    this.installed = [isSilent, isForceRunAfter];
  }
}

/** Timer finti: si eseguono a mano. */
function fakeTimers() {
  const timeouts = new Map<number, { fn: () => void; ms: number }>();
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  let id = 0;
  return {
    timeouts,
    intervals,
    setTimeout: (fn: () => void, ms: number) => (timeouts.set(++id, { fn, ms }), id),
    setInterval: (fn: () => void, ms: number) => (intervals.set(++id, { fn, ms }), id),
    clearTimeout: (handle: number | null) => handle !== null && timeouts.delete(handle),
    clearInterval: (handle: number | null) => handle !== null && intervals.delete(handle),
  };
}

function controller(mode: "auto" | "manual" = "auto") {
  const updater = new FakeUpdater();
  const timers = fakeTimers();
  const changes: { phase: string; progress: number | null }[] = [];
  const updates = createUpdateController({
    updater,
    mode,
    downloadUrl: RELEASES,
    onChange: (status: { phase: string; progress: number | null }) => changes.push(status),
    timers,
    now: () => NOW,
  });
  return { updater, timers, changes, updates };
}

describe("controllo degli aggiornamenti", () => {
  it("senza versioni nuove indica quando ha controllato", async () => {
    const { updates } = controller();

    expect(await updates.check()).toEqual({
      mode: "auto",
      note: null,
      automatic: false,
      downloadUrl: RELEASES,
      phase: "current",
      version: null,
      progress: null,
      checkedAt: NOW.toISOString(),
      error: null,
    });
  });

  it("scarica la versione nuova mostrando l'avanzamento, poi è pronta", async () => {
    const { updater, changes, updates } = controller();
    updater.next = (u) => {
      u.emit("checking-for-update");
      u.emit("update-available", { version: "1.2.1" });
      u.emit("download-progress", { percent: 42.7 });
      u.emit("update-downloaded", { version: "1.2.1" });
    };

    const status = await updates.check();

    expect(changes.map((c) => [c.phase, c.progress])).toEqual([
      ["checking", null],
      ["downloading", 0],
      ["downloading", 42],
      ["ready", 100],
    ]);
    expect(status).toMatchObject({ phase: "ready", version: "1.2.1" });
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it("con una versione pronta o un download in corso non ricontrolla", async () => {
    const { updater, updates } = controller();
    updater.next = (u) => u.emit("update-available", { version: "1.2.1" });
    await updates.check();
    await updates.check();

    expect(updater.checks).toBe(1);
  });

  it("installa solo una versione pronta, chiudendo e riaprendo l'app senza finestre", async () => {
    const { updater, updates } = controller();
    expect(updates.install()).toBe(false);
    expect(updater.installed).toBeNull();

    updater.next = (u) => u.emit("update-downloaded", { version: "1.2.1" });
    await updates.check();

    expect(updates.install()).toBe(true);
    expect(updater.installed).toEqual([true, true]);
  });

  it("con il pacchetto .deb segnala la versione nuova senza scaricarla", async () => {
    const { updater, updates } = controller("manual");
    updater.next = (u) => u.emit("update-available", { version: "1.2.1" });

    expect(await updates.check()).toMatchObject({ mode: "manual", phase: "available", version: "1.2.1", progress: null });
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updates.install()).toBe(false);
  });
});

describe("errori", () => {
  it("un controllo non riuscito diventa un messaggio comprensibile", async () => {
    const { updater, updates } = controller();
    updater.next = async (u) => {
      const err = new Error("net::ERR_INTERNET_DISCONNECTED");
      u.emit("error", err);
      throw err;
    };

    expect(await updates.check()).toMatchObject({
      phase: "error",
      error: "Nessuna connessione con il server degli aggiornamenti",
      checkedAt: NOW.toISOString(),
    });
  });

  it("dopo un errore si può ricontrollare", async () => {
    const { updater, updates } = controller();
    updater.next = async () => {
      throw new Error("ENOTFOUND github.com");
    };
    await updates.check();
    updater.next = (u) => u.emit("update-not-available", {});

    expect((await updates.check()).phase).toBe("current");
  });

  it("una versione già pronta resta pronta se un errore arriva dopo", async () => {
    const { updater, updates } = controller();
    updater.next = (u) => u.emit("update-downloaded", { version: "1.2.1" });
    await updates.check();
    updater.emit("error", new Error("qualcosa"));

    expect(updates.status()).toMatchObject({ phase: "ready", version: "1.2.1", error: expect.stringContaining("qualcosa") });
  });

  it.each([
    ["ENOTFOUND github.com", "Nessuna connessione con il server degli aggiornamenti"],
    ["net::ERR_PROXY_CONNECTION_FAILED", "Nessuna connessione con il server degli aggiornamenti"],
    ["HttpError: 404 \n\"method: GET url: https://github.com/.../latest.yml\"", "La release non contiene i file dell'aggiornamento"],
    ["sha512 checksum mismatch, expected abc, got def", "Il file scaricato non corrisponde a quello della release: verrà scaricato di nuovo"],
    ["Qualcos'altro\nseconda riga", "Aggiornamento non riuscito: Qualcos'altro"],
  ])("%s", (message, expected) => {
    expect(updateErrorMessage(new Error(message))).toBe(expected);
  });
});

describe("aggiornamento precedente non riuscito", () => {
  it("si vede all'avvio e un nuovo controllo lo sostituisce", async () => {
    const updater = new FakeUpdater();
    const updates = createUpdateController({
      updater,
      mode: "auto",
      initialError: "L'ultimo aggiornamento non è riuscito",
      downloadUrl: RELEASES,
      onChange: () => {},
      timers: fakeTimers(),
      now: () => NOW,
    });

    expect(updates.status()).toMatchObject({ phase: "error", error: "L'ultimo aggiornamento non è riuscito" });
    expect((await updates.check()).phase).toBe("current");
  });

  it("la nota spiega perché la versione nuova viene solo segnalata", () => {
    const updates = createUpdateController({
      updater: new FakeUpdater(),
      mode: "manual",
      note: "L'app è aperta dal disco del .dmg.",
      downloadUrl: RELEASES,
      onChange: () => {},
    });

    expect(updates.status()).toMatchObject({ mode: "manual", note: "L'app è aperta dal disco del .dmg." });
  });
});

describe("controlli automatici", () => {
  it("il primo poco dopo l'attivazione, poi ogni 6 ore", async () => {
    const { updater, timers, updates } = controller();
    updates.setAutomatic(true);

    expect([...timers.timeouts.values()].map((t) => t.ms)).toEqual([FIRST_CHECK_DELAY_MS]);
    expect([...timers.intervals.values()].map((t) => t.ms)).toEqual([CHECK_INTERVAL_MS]);
    expect(CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    expect(updates.status().automatic).toBe(true);

    await [...timers.timeouts.values()][0].fn();
    expect(updater.checks).toBe(1);
  });

  it("si fermano disattivandoli; il controllo a mano resta possibile", async () => {
    const { updater, timers, updates } = controller();
    updates.setAutomatic(true);
    updates.setAutomatic(false);

    expect(timers.timeouts.size).toBe(0);
    expect(timers.intervals.size).toBe(0);
    expect(updates.status().automatic).toBe(false);
    await updates.check();
    expect(updater.checks).toBe(1);
  });

  it("riattivandoli non si accumulano", () => {
    const { timers, updates } = controller();
    updates.setAutomatic(true);
    updates.setAutomatic(true);

    expect(timers.timeouts.size).toBe(1);
    expect(timers.intervals.size).toBe(1);
  });
});
