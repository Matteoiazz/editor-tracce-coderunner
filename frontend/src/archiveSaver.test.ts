import { describe, expect, it } from "vitest";
import type { ArchivedTrack } from "./archive";
import { createArchiveSaver } from "./archiveSaver";

function track(day: string): ArchivedTrack {
  return { id: "t1", kind: "Esame", day, number: 1, common_tests: [], exercises: [] };
}

/** Archivio finto: registra i salvataggi e può fallire a comando. */
function fakeArchive() {
  const saved: string[] = [];
  const errors: unknown[] = [];
  let failing = false;
  const saver = createArchiveSaver(
    async (t) => {
      if (failing) throw new Error("backend non raggiungibile");
      saved.push(t.day ?? "");
    },
    (e) => errors.push(e),
  );
  return { saver, saved, errors, setFailing: (value: boolean) => (failing = value) };
}

describe("createArchiveSaver", () => {
  it("salva la versione in attesa una sola volta", async () => {
    const { saver, saved } = fakeArchive();
    expect(saver.set(track("2026-07-01"))).toBe(true);
    await saver.flush();
    await saver.flush();
    expect(saved).toEqual(["2026-07-01"]);
  });

  it("non salva una versione uguale a quella aperta o già salvata", async () => {
    const { saver, saved } = fakeArchive();
    saver.markSaved(track("2026-07-01"));
    expect(saver.set(track("2026-07-01"))).toBe(false);
    await saver.flush();
    expect(saved).toEqual([]);
  });

  it("una traccia vuota annulla la versione in attesa", async () => {
    const { saver, saved } = fakeArchive();
    saver.set(track("2026-07-01"));
    expect(saver.set(null)).toBe(false);
    await saver.flush();
    expect(saved).toEqual([]);
  });

  it("ritenta un salvataggio non riuscito al salvataggio successivo", async () => {
    const { saver, saved, errors, setFailing } = fakeArchive();
    setFailing(true);
    saver.set(track("2026-07-01"));
    await saver.flush();
    expect(errors).toHaveLength(1);

    setFailing(false);
    await saver.flush(); // es. alla chiusura della finestra
    expect(saved).toEqual(["2026-07-01"]);
  });

  it("dopo un errore salva la versione più recente, non quella fallita", async () => {
    const { saver, saved, setFailing } = fakeArchive();
    setFailing(true);
    saver.set(track("2026-07-01"));
    const failed = saver.flush();
    saver.set(track("2026-07-02"));
    await failed;

    setFailing(false);
    await saver.flush();
    expect(saved).toEqual(["2026-07-02"]);
  });

  it("esegue i salvataggi nell'ordine in cui sono stati chiesti", async () => {
    const { saver, saved } = fakeArchive();
    saver.set(track("2026-07-01"));
    const first = saver.flush();
    saver.set(track("2026-07-02"));
    await Promise.all([first, saver.flush()]);
    expect(saved).toEqual(["2026-07-01", "2026-07-02"]);
  });
});
