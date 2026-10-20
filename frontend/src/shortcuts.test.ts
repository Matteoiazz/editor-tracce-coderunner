import { describe, expect, it } from "vitest";
import { isMacPlatform, redoShortcut, shortcut } from "./shortcuts";

describe("scorciatoie da tastiera", () => {
  it("riconosce macOS dallo user agent di Electron", () => {
    expect(isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/44.4.3")).toBe(true);
    expect(isMacPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/44.4.3")).toBe(false);
    expect(isMacPlatform("Mozilla/5.0 (X11; Linux x86_64) Electron/44.4.3")).toBe(false);
  });

  it("usa Cmd su macOS e Ctrl sugli altri sistemi", () => {
    expect(shortcut("B", true)).toBe("⌘B");
    expect(shortcut("B", false)).toBe("Ctrl+B");
    expect(redoShortcut(true)).toBe("⇧⌘Z");
    expect(redoShortcut(false)).toBe("Ctrl+Y");
  });
});
