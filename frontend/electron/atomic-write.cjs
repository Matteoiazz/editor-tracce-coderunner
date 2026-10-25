// Scrittura sicura di un file: il contenuto va prima in un file temporaneo, salvato su disco,
// che poi prende il posto di quello vecchio. Un'interruzione (crash, mancanza di corrente)
// lascia il file vecchio o quello nuovo, mai uno scritto a metà.

const crypto = require("node:crypto");
const fs = require("node:fs/promises");

// Su Windows un antivirus o l'indicizzazione possono tenere aperto il file per un attimo
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_MS = 50;

async function writeFileAtomic(file, text) {
  // Nome diverso a ogni scrittura: due scritture contemporanee non usano lo stesso temporaneo
  const temporary = `${file}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    const handle = await fs.open(temporary, "w");
    try {
      await handle.writeFile(text, "utf-8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (let attempt = 1; ; attempt++) {
      try {
        await fs.rename(temporary, file);
        return;
      } catch (err) {
        const busy = ["EPERM", "EACCES", "EBUSY"].includes(err.code);
        if (!busy || attempt === RENAME_ATTEMPTS) throw err;
        await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_MS * attempt));
      }
    }
  } catch (err) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw err;
  }
}

module.exports = { writeFileAtomic };
