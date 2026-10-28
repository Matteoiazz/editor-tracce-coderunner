import { IconArchive, IconDocument, IconSettings } from "./icons";

/** Le tre parti dell'applicazione: la traccia aperta, l'archivio, le impostazioni. */
export type Area = "track" | "archive" | "settings";

interface Props {
  area: Area;
  /** Come si chiama la traccia aperta, es. "Esame · 14 febbraio 2027 · Traccia 2". */
  trackTitle: string;
  onSelect: (area: Area) => void;
}

const AREAS: { area: Area; label: string; icon: typeof IconDocument; title: string }[] = [
  { area: "track", label: "Traccia", icon: IconDocument, title: "La traccia su cui stai lavorando" },
  { area: "archive", label: "Archivio", icon: IconArchive, title: "Tracce ed esercizi salvati, cestino e backup" },
  { area: "settings", label: "Impostazioni", icon: IconSettings, title: "Chiave e modello dell'AI, aggiornamenti" },
];

/** Barra in alto con le tre parti dell'applicazione. La traccia aperta mostra anche il suo nome,
 *  così è chiaro su cosa si torna. */
export function TopBar({ area, trackTitle, onSelect }: Props) {
  return (
    <header className="topbar">
      <nav className="topbar-nav" aria-label="Parti dell'applicazione">
        {AREAS.map(({ area: target, label, icon: Icon, title }) => (
          <button
            key={target}
            type="button"
            className={`topbar-tab${area === target ? " active" : ""}`}
            aria-current={area === target ? "page" : undefined}
            title={title}
            onClick={() => onSelect(target)}
          >
            <Icon />
            {label}
            {target === "track" && <span className="topbar-detail">{trackTitle}</span>}
          </button>
        ))}
      </nav>
    </header>
  );
}
