// Avvia scripts/prepara_python.py con il Python del venv del backend, che su Windows si trova
// in .venv/Scripts e su macOS e Linux in .venv/bin.

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const venv = path.join(__dirname, "..", "..", "backend", ".venv");
const python =
  process.platform === "win32"
    ? path.join(venv, "Scripts", "python.exe")
    : path.join(venv, "bin", "python");

const result = spawnSync(python, [path.join(__dirname, "prepara_python.py")], {
  stdio: "inherit",
});
if (result.error) {
  console.error(`Impossibile avviare ${python}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
