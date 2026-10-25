// Chiave API di OpenRouter nella vista Impostazioni: regole dei campi e testi mostrati.
// Le stesse regole sono controllate da electron/api-key.cjs; qui servono a segnalare
// l'errore già nel campo, prima di inviare qualcosa.

import { dollars } from "./settings";

export const MIN_PASSWORD_LENGTH = 8;

/** Problema della chiave incollata nel campo, oppure null. */
export function keyProblem(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed === "") return "Incolla la chiave";
  if (trimmed.length < 20 || trimmed.length > 500 || /\s/.test(trimmed)) {
    return "Non sembra una chiave di OpenRouter: copiala per intero, senza spazi";
  }
  return null;
}

/** Problema di una nuova master password scritta due volte, oppure null. */
export function newPasswordProblem(password: string, repeated: string): string | null {
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    return `La master password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`;
  }
  if (password !== repeated) return "Le due password non coincidono";
  return null;
}

/** Dove sta la chiave salvata e, se è protetta, se è già sbloccata. */
export function protectionText(status: ApiKeyStatus): string {
  if (!status.protected) {
    return status.weakKeychain
      ? "Conservata senza master password, con una protezione debole"
      : "Conservata nel portachiavi del sistema";
  }
  return status.unlocked
    ? "Protetta da master password · sbloccata per questa sessione"
    : "Protetta da master password · bloccata";
}

/** Dettagli di una chiave valida, una frase per riga; solo quelli indicati da OpenRouter. */
export function keyDetails(check: Extract<KeyCheck, { outcome: "valid" }>): string[] {
  const lines: string[] = [];
  if (check.freeRequestsRemaining !== null && check.freeRequestsLimit !== null) {
    lines.push(
      `Modelli gratuiti: ${check.freeRequestsRemaining} richieste rimaste oggi su ${check.freeRequestsLimit}.`,
    );
  }
  if (check.limit !== null && check.limitRemaining !== null) {
    lines.push(
      `Limite di spesa della chiave: ${dollars(check.limitRemaining)} rimasti su ${dollars(check.limit)}.`,
    );
  }
  if (check.usage !== null) lines.push(`Spesa finora con questa chiave: ${dollars(check.usage)}.`);
  if (check.expiresAt !== null && !Number.isNaN(Date.parse(check.expiresAt))) {
    const day = new Date(check.expiresAt).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    lines.push(`Scade il ${day}.`);
  }
  return lines;
}
