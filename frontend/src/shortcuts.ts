// Scorciatoie da tastiera scritte come le mostra il sistema: su macOS si usa il tasto Cmd (⌘)
// al posto di Ctrl, e Ripeti è Maiusc+Cmd+Z.

export function isMacPlatform(userAgent: string = navigator.userAgent): boolean {
  return /Macintosh|Mac OS X/.test(userAgent);
}

/** Il tasto indicato insieme a Ctrl (Windows e Linux) o a Cmd (macOS), es. "Ctrl+B" o "⌘B". */
export function shortcut(key: string, mac: boolean = isMacPlatform()): string {
  return mac ? `⌘${key}` : `Ctrl+${key}`;
}

export function redoShortcut(mac: boolean = isMacPlatform()): string {
  return mac ? "⇧⌘Z" : "Ctrl+Y";
}
