// Il testo dell'esercizio (HTML): la sua forma senza formattazione, se ha un contenuto, e gli
// elementi che l'editor visuale non sa rappresentare. L'editor li scarterebbe alla prima
// modifica: vanno segnalati prima che accada.

// Entità frequenti nei testi esportati da Moodle; quelle numeriche si decodificano tutte
const ENTITIES: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
  agrave: "à",
  egrave: "è",
  eacute: "é",
  igrave: "ì",
  ograve: "ò",
  ugrave: "ù",
  Agrave: "À",
  Egrave: "È",
  Eacute: "É",
  Igrave: "Ì",
  Ograve: "Ò",
  Ugrave: "Ù",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== "#") return ENTITIES[name] ?? entity;
    const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

/** Testo senza formattazione di un frammento HTML, su una riga (per le anteprime). */
export function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Vero se il testo HTML contiene parole. */
export function hasText(html: string): boolean {
  return plainText(html).length > 0;
}

/** Vero se il testo dell'esercizio ha un contenuto: parole, oppure immagini, formule e simili
 *  (su Moodle un testo fatto solo di un'immagine è valido). */
export function hasContent(html: string): boolean {
  return hasText(html) || unsupportedElements(html).length > 0;
}

/** Perché il testo non basta a una funzione AI, oppure null: il modello legge solo le parole.
 *  `missing` è il messaggio per il testo vuoto. */
export function aiTextProblem(html: string, missing: string): string | null {
  if (hasText(html)) return null;
  return hasContent(html)
    ? "Il modello non vede le immagini: per le funzioni AI il testo dell'esercizio deve contenere anche parole."
    : missing;
}

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
