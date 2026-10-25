// Scelta del modello delle funzioni AI: ricerca nell'elenco di OpenRouter e testi mostrati.

/** Identificativo di un modello di OpenRouter: "fornitore/nome", senza spazi. È la stessa
 *  regola con cui electron/settings.cjs accetta il valore; qui serve a segnalarlo nel campo. */
export function isModelId(value: string): boolean {
  return value.length <= 200 && /^[^\s/]+\/\S+$/.test(value);
}

/** Modelli che contengono tutte le parole cercate, nel nome o nell'identificativo. */
export function filterModels(models: ModelInfo[], query: string, onlyFree: boolean): ModelInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return models.filter((model) => {
    if (onlyFree && !model.free) return false;
    const text = `${model.name} ${model.id}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Importo in dollari: due decimali, tre per i prezzi sotto i 10 centesimi. */
export function dollars(amount: number): string {
  const digits = amount > 0 && amount < 0.1 ? 3 : 2;
  return `${amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: digits })} $`;
}

/** Costo del modello: gratuito, variabile o per milione di token in ingresso e in uscita. */
export function priceText(model: ModelInfo): string {
  if (model.free) return "gratuito";
  if (model.promptPrice === null || model.completionPrice === null) return "prezzo variabile";
  return `input ${dollars(model.promptPrice)} · output ${dollars(model.completionPrice)} per milione di token`;
}

/** Lunghezza massima della conversazione, es. "262.144 token di contesto". */
export function contextText(tokens: number): string {
  return `${tokens.toLocaleString("it-IT")} token di contesto`;
}

/** Messaggio di un errore del processo principale, senza il prefisso aggiunto da Electron. */
export function ipcErrorText(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/^Error invoking remote method '[^']*': (\w*Error: )?/, "");
}
