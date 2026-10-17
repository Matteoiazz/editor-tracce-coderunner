import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// Regole su cosa può caricare la pagina dell'app installata. I testi degli esercizi sono
// HTML importato da XML: anche se contenessero uno script, non verrebbe eseguito.
// - script, worker e font solo dai file dell'app;
// - stili inline ammessi: li usano l'editor del codice e quello del testo;
// - immagini anche incorporate nel testo (data:), come negli XML di Moodle;
// - connessioni solo verso il backend locale.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Aggiunge la CSP solo alla build: il server di sviluppo di Vite inserisce script
 *  nella pagina e non funzionerebbe con queste regole. */
function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  // Percorsi relativi: in produzione Electron carica dist/index.html da file://
  base: "./",
  server: { port: 5173, strictPort: true },
});
