import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Percorsi relativi: in produzione Electron carica dist/index.html da file://
  base: "./",
  server: { port: 5173, strictPort: true },
});
