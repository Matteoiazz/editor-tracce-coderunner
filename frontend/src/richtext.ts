// Contenuti del testo della traccia che l'editor visuale non sa rappresentare.
// L'editor li scarterebbe alla prima modifica: vanno segnalati prima che accada.

const UNSUPPORTED: { tag: string; one: string; many: string }[] = [
  { tag: "img", one: "un'immagine", many: "immagini" },
  { tag: "svg", one: "un disegno SVG", many: "disegni SVG" },
  { tag: "math", one: "una formula", many: "formule" },
  { tag: "video", one: "un video", many: "video" },
  { tag: "audio", one: "un audio", many: "audio" },
  { tag: "iframe", one: "un contenuto incorporato", many: "contenuti incorporati" },
  { tag: "object", one: "un contenuto incorporato", many: "contenuti incorporati" },
  { tag: "embed", one: "un contenuto incorporato", many: "contenuti incorporati" },
];

/** Descrizioni (es. "2 immagini") degli elementi non supportati presenti nell'HTML. */
export function unsupportedElements(html: string): string[] {
  const counts = new Map<string, number>();
  for (const { tag, one, many } of UNSUPPORTED) {
    // Il testo visibile ha i caratteri < codificati come &lt;: qui si trovano solo veri tag
    const found = html.match(new RegExp(`<${tag}\\b`, "gi"))?.length ?? 0;
    if (found === 0) continue;
    const label = found === 1 ? one : many;
    counts.set(label, (counts.get(label) ?? 0) + found);
  }
  return [...counts].map(([label, n]) => (n === 1 ? label : `${n} ${label}`));
}

/** Unisce un elenco in una frase: "a", "a e b", "a, b e c". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
