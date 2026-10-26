#!/bin/bash
# Aggiornatore per macOS: dopo la chiusura dell'app mette la versione nuova al posto di quella
# installata. La versione attuale viene spostata da parte e torna al suo posto se qualcosa va
# storto. Lo avvia l'app, staccato da sé, perché deve continuare dopo che l'app si è chiusa.
#
# Uso: mac-swap.sh PID APP NUOVA PRECEDENTE RIAPRI REGISTRO ESITO [APRI]
#   PID         processo dell'app, di cui aspettare la chiusura
#   APP         app installata, es. "/Applications/Editor tracce CodeRunner.app"
#   NUOVA       versione nuova, già scaricata, estratta e controllata
#   PRECEDENTE  dove spostare la versione attuale finché la nuova non è a posto
#   RIAPRI      1 per riaprire l'app e controllare che parta, 0 per lasciarla chiusa
#   REGISTRO    file in cui annotare ogni passo
#   ESITO       file in cui scrivere "ok" o "errore: motivo", letto dall'app al prossimo avvio
#   APRI        comando che apre l'app (predefinito: open)

set -u
PID=$1
APP=$2
NEW=$3
BACKUP=$4
RELAUNCH=$5
LOG=$6
RESULT=$7
OPENER=${8:-open}

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"
}

fail() {
  log "ERRORE: $1"
  printf 'errore: %s\n' "$1" > "$RESULT"
  exit 1
}

# Vero se un processo dell'app installata è in esecuzione
running() {
  pgrep -f "$APP/Contents/MacOS/" > /dev/null 2>&1
}

restore() {
  rm -rf "$APP"
  mv "$BACKUP" "$APP"
}

log "attesa della chiusura dell'app (processo $PID)"
for _ in $(seq 1 240); do
  kill -0 "$PID" 2> /dev/null || break
  sleep 0.5
done
if kill -0 "$PID" 2> /dev/null; then
  fail "l'app non si è chiusa entro due minuti"
fi

rm -rf "$BACKUP"
if ! mv "$APP" "$BACKUP"; then
  fail "non è stato possibile spostare la versione attuale (permessi della cartella?)"
fi
if ! mv "$NEW" "$APP"; then
  restore
  if [ "$RELAUNCH" = 1 ]; then "$OPENER" "$APP"; fi
  fail "non è stato possibile mettere al suo posto la versione nuova; è tornata quella precedente"
fi
log "versione nuova al suo posto"

if [ "$RELAUNCH" = 1 ]; then
  "$OPENER" "$APP"
  for _ in $(seq 1 40); do
    running && break
    sleep 0.5
  done
  if ! running; then
    log "la versione nuova non si è avviata: ripristino di quella precedente"
    restore
    "$OPENER" "$APP"
    fail "la versione nuova non si è avviata; è tornata quella precedente"
  fi
  rm -rf "$BACKUP"
  log "versione nuova avviata"
fi

printf 'ok\n' > "$RESULT"
log "aggiornamento completato"
