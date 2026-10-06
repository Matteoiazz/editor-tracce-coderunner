// Salvataggio della traccia aperta nell'archivio: tiene la versione in attesa, salta i
// salvataggi senza modifiche, esegue i salvataggi in ordine e ritenta quelli non riusciti.

import type { ArchivedTrack } from "./archive";

export interface ArchiveSaver {
  /** Indica la versione appena aperta o salvata: non serve salvarla di nuovo. */
  markSaved(track: ArchivedTrack): void;
  /** Nuova versione da salvare, o null se non c'è nulla da salvare (traccia vuota).
   *  Restituisce false se la versione è uguale all'ultima salvata. */
  set(track: ArchivedTrack | null): boolean;
  /** Invia subito la versione in attesa; si risolve a salvataggio finito, anche se non riesce. */
  flush(): Promise<void>;
}

export function createArchiveSaver(
  save: (track: ArchivedTrack) => Promise<unknown>,
  onError: (error: unknown) => void,
): ArchiveSaver {
  let pending: ArchivedTrack | null = null;
  let savedContent: string | null = null;
  // Un salvataggio parte solo quando il precedente è finito: uno più vecchio non può
  // sovrascrivere uno più recente
  let queue: Promise<void> = Promise.resolve();

  return {
    markSaved(track) {
      savedContent = JSON.stringify(track);
    },

    set(track) {
      if (track === null || JSON.stringify(track) === savedContent) {
        pending = null;
        return false;
      }
      pending = track;
      return true;
    },

    flush() {
      const track = pending;
      pending = null;
      if (track) {
        const content = JSON.stringify(track);
        queue = queue
          .then(async () => {
            await save(track);
            savedContent = content;
          })
          .catch((error) => {
            // Si ritenta al prossimo salvataggio, se nel frattempo non c'è una versione più recente
            pending ??= track;
            onError(error);
          });
      }
      return queue;
    },
  };
}
