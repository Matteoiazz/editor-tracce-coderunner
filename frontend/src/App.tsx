import { useEffect, useState } from "react";

type Stato =
  | { tipo: "connessione" }
  | { tipo: "ok"; url: string }
  | { tipo: "errore"; messaggio: string };

export function App() {
  const [stato, setStato] = useState<Stato>({ tipo: "connessione" });

  useEffect(() => {
    async function verificaBackend() {
      try {
        // window.desktop esiste solo dentro Electron (lo espone il preload).
        const url = await window.desktop.getBackendUrl();
        const risposta = await fetch(`${url}/health`);
        if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
        setStato({ tipo: "ok", url });
      } catch (e) {
        setStato({ tipo: "errore", messaggio: String(e) });
      }
    }
    verificaBackend();
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
      <h1>Tesi</h1>
      {stato.tipo === "connessione" && <p>Connessione al backend…</p>}
      {stato.tipo === "ok" && <p>Backend OK ({stato.url})</p>}
      {stato.tipo === "errore" && <p>Errore: {stato.messaggio}</p>}
    </main>
  );
}
