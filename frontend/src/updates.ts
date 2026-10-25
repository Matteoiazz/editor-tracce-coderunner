// Testi dell'aggiornamento dell'app, nella vista Impostazioni e nel messaggio in alto.

import { formatMoment } from "./archive";

type ActiveUpdate = Exclude<UpdateStatus, { mode: "none" }>;

/** Cosa sta succedendo, in una frase. */
export function updateStatusText(status: ActiveUpdate): string {
  const when = status.checkedAt ? ` (controllo del ${formatMoment(status.checkedAt)})` : "";
  switch (status.phase) {
    case "idle":
      return "Nessun controllo in questa sessione.";
    case "checking":
      return "Controllo in corso…";
    case "current":
      return `Hai l'ultima versione${when}.`;
    case "downloading":
      return `Download della versione ${status.version}: ${status.progress ?? 0}%.`;
    case "ready":
      return `La versione ${status.version} è pronta: si installa alla chiusura dell'app.`;
    case "available":
      return `È disponibile la versione ${status.version}: si scarica dalla pagina delle release.`;
    case "error":
      return `${status.error}${when}.`;
  }
}

/** Il messaggio in alto, se c'è da mostrarlo: una versione pronta da installare o, con il
 *  pacchetto .deb, una versione da scaricare. Non si ripete per una versione già rimandata. */
export function updateBanner(status: UpdateStatus | null, postponed: string | null): ActiveUpdate | null {
  if (!status || status.mode === "none") return null;
  if (status.phase !== "ready" && status.phase !== "available") return null;
  return status.version === postponed ? null : status;
}
