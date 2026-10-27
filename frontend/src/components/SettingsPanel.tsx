import { type FormEvent, useEffect, useRef, useState } from "react";
import { formatMoment } from "../archive";
import { contextText, filterModels, ipcErrorText, isModelId, modelCheckText, priceText } from "../settings";
import { updateStatusText } from "../updates";
import { ApiKeySection } from "./ApiKeySection";
import { IconCheck, IconRestore } from "./icons";

interface Props {
  onError: (message: string) => void;
  /** Stato dell'aggiornamento dell'app, tenuto aggiornato da App. */
  update: UpdateStatus | null;
  installingUpdate: boolean;
  onInstallUpdate: () => void;
}

/** Impostazioni dell'applicazione, valide per tutte le tracce: chiave API e modello delle
 *  funzioni AI, aggiornamento dell'app. Ogni scelta si salva subito. */
export function SettingsPanel({ onError, update, installingUpdate, onInstallUpdate }: Props) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [list, setList] = useState<ModelList | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Con le frecce si cambia modello rapidamente: vale la risposta dell'ultima scelta
  const lastChoice = useRef(0);
  // Prova del modello: esito o errore valgono per il modello con cui è stata fatta
  const [modelCheck, setModelCheck] = useState<{ model: string; check?: ModelCheck; error?: string } | null>(
    null,
  );
  const [checkingModel, setCheckingModel] = useState(false);
  const scrolledToCurrent = useRef(false);

  useEffect(() => {
    window.desktop.settings
      .get()
      .then(setView, (e) => onError(`Lettura delle impostazioni non riuscita: ${ipcErrorText(e)}`));
    window.desktop.getAppVersion().then(setVersion);
    loadModels(false);
  }, []);

  // All'apertura l'elenco mostra il modello scelto, a metà altezza
  useEffect(() => {
    const box = listRef.current;
    if (scrolledToCurrent.current || !box || !view || !list?.models.length) return;
    scrolledToCurrent.current = true;
    const row = box.querySelector<HTMLElement>(".model-option.selected");
    if (row) box.scrollTop = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
  }, [view, list]);

  async function loadModels(refresh: boolean) {
    setLoadingList(true);
    try {
      setList(await window.desktop.settings.listModels(refresh));
    } catch (e) {
      setList((current) => ({
        models: current?.models ?? [],
        fetchedAt: current?.fetchedAt ?? null,
        error: ipcErrorText(e),
      }));
    } finally {
      setLoadingList(false);
    }
  }

  async function choose(model: string) {
    if (!view) return;
    const previous = view;
    const choice = ++lastChoice.current;
    setView({ ...view, ai: { ...view.ai, model } });
    try {
      const saved = await window.desktop.settings.update({ ai: { model } });
      if (choice === lastChoice.current) setView(saved);
    } catch (e) {
      if (choice === lastChoice.current) setView(previous);
      onError(`Modello non salvato: ${ipcErrorText(e)}`);
    }
  }

  async function checkModel() {
    if (!view) return;
    const model = view.ai.model;
    setCheckingModel(true);
    setModelCheck(null);
    try {
      setModelCheck({ model, check: await window.desktop.ai.check() });
    } catch (e) {
      setModelCheck({ model, error: ipcErrorText(e) });
    } finally {
      setCheckingModel(false);
    }
  }

  async function setShowRequest(showRequest: boolean) {
    if (!view) return;
    const previous = view;
    setView({ ...view, ai: { ...view.ai, showRequest } });
    try {
      setView(await window.desktop.settings.update({ ai: { showRequest } }));
    } catch (e) {
      setView(previous);
      onError(`Impostazione non salvata: ${ipcErrorText(e)}`);
    }
  }

  async function setAutoUpdate(auto: boolean) {
    if (!view) return;
    const previous = view;
    setView({ ...view, updates: { auto } });
    try {
      setView(await window.desktop.settings.update({ updates: { auto } }));
    } catch (e) {
      setView(previous);
      onError(`Impostazione non salvata: ${ipcErrorText(e)}`);
    }
  }

  function handleCustom(event: FormEvent) {
    event.preventDefault();
    const id = custom.trim();
    if (!isModelId(id)) {
      setCustomError("Scrivi l'identificativo come su OpenRouter: fornitore/nome, senza spazi.");
      return;
    }
    setCustomError(null);
    setCustom("");
    choose(id);
  }

  if (!view) {
    return (
      <article className="settings-view">
        <header className="view-head">
          <h1>Impostazioni</h1>
        </header>
        <p className="muted">Caricamento delle impostazioni…</p>
      </article>
    );
  }

  const models = list?.models ?? [];
  const current = models.find((m) => m.id === view.ai.model);
  const isDefault = view.ai.model === view.defaultModel;
  const visible = filterModels(models, query, onlyFree);

  function listStatus(): string {
    if (!list) return "Caricamento dell'elenco…";
    if (loadingList) return "Aggiornamento dell'elenco…";
    if (!list.fetchedAt) return "Elenco dei modelli non disponibile";
    const count =
      visible.length === models.length ? `${models.length}` : `${visible.length} di ${models.length}`;
    return `${count} modelli · elenco di OpenRouter del ${formatMoment(list.fetchedAt)}`;
  }

  return (
    <article className="settings-view">
      <header className="view-head">
        <h1>Impostazioni</h1>
        <p className="view-lede">Valgono per tutta l'applicazione e si salvano appena le cambi.</p>
      </header>

      {view.damagedCopy && (
        <p className="inline-notice">
          Il file delle impostazioni era illeggibile: si è ripartiti dai valori predefiniti. Una copia
          del file è in {view.damagedCopy}.
        </p>
      )}

      <section className="settings-section" aria-labelledby="impostazioni-ai">
        <h2 id="impostazioni-ai">Intelligenza artificiale</h2>
        <p className="settings-lede">
          Chiave e modello usati dalle funzioni di intelligenza artificiale, tramite OpenRouter.
        </p>

        <ApiKeySection />

        <h3 className="settings-label">Modello</h3>
        <div className="model-current">
          <div className="model-current-info" aria-live="polite">
            {/* Un modello che non è nell'elenco si conosce solo per identificativo */}
            <p className="model-current-name">
              <strong className={current ? undefined : "mono"}>{current?.name ?? view.ai.model}</strong>
              {isDefault && <span className="model-tag">predefinito</span>}
            </p>
            {current && <p className="mono small-text">{view.ai.model}</p>}
            {current ? (
              <p className="small-text muted">
                {priceText(current)}
                {current.context !== null && ` · ${contextText(current.context)}`}
              </p>
            ) : (
              models.length > 0 && (
                <p className="small-text model-missing">
                  Non è nell'elenco di OpenRouter: controlla che l'identificativo sia scritto bene.
                </p>
              )
            )}
          </div>
          {!isDefault && (
            <button type="button" className="ghost small" onClick={() => choose(view.defaultModel)}>
              <IconRestore /> Torna al predefinito
            </button>
          )}
        </div>

        <div className="key-actions">
          <button type="button" className="secondary" disabled={checkingModel} onClick={checkModel}>
            {checkingModel ? "Prova in corso…" : "Prova il modello"}
          </button>
          {checkingModel && (
            <span className="small-text muted">I modelli gratuiti possono impiegare fino a un minuto.</span>
          )}
        </div>
        {modelCheck?.model === view.ai.model &&
          (modelCheck.check?.correct ? (
            <div className="key-check" role="status">
              <IconCheck />
              <p>{modelCheckText(modelCheck.check)}</p>
            </div>
          ) : (
            <p className="inline-notice" role="status">
              {modelCheck.check ? modelCheckText(modelCheck.check) : `${modelCheck.error}.`}
            </p>
          ))}

        {models.length > 0 && (
          <div className="model-toolbar">
            <input
              type="search"
              className="model-search"
              placeholder="Cerca per nome o identificativo, es. nemotron"
              aria-label="Cerca un modello"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="checkbox">
              <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
              Solo gratuiti
            </label>
          </div>
        )}

        <p className="model-list-meta small-text muted">
          <span aria-live="polite">{listStatus()}</span>
          <button
            type="button"
            className="ghost small"
            onClick={() => loadModels(true)}
            disabled={loadingList}
          >
            Aggiorna elenco
          </button>
        </p>

        {list?.error && (
          <p className="inline-notice">
            {list.error}.{" "}
            {models.length > 0
              ? "L'elenco mostrato è quello salvato."
              : "Senza elenco puoi scrivere l'identificativo del modello qui sotto."}
          </p>
        )}

        {models.length > 0 && (
          <div className="model-list" role="radiogroup" aria-label="Modelli di OpenRouter" ref={listRef}>
            {visible.map((m) => (
              <label key={m.id} className={`model-option${m.id === view.ai.model ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="modello"
                  checked={m.id === view.ai.model}
                  onChange={() => choose(m.id)}
                />
                <span className="model-option-text">
                  <span className="model-option-name">{m.name}</span>
                  <span className="model-option-meta">
                    <span className="mono">{m.id}</span> · {priceText(m)}
                  </span>
                </span>
              </label>
            ))}
            {visible.length === 0 && (
              <p className="model-empty">
                Nessun modello corrisponde alla ricerca
                {onlyFree ? " tra quelli gratuiti" : ""}.
              </p>
            )}
          </div>
        )}
        <p className="small-text muted settings-note">
          I modelli gratuiti hanno un limite di richieste al giorno, e alcuni fornitori possono usare
          le richieste per addestrare i propri modelli (si regola nelle impostazioni di privacy di
          OpenRouter).
        </p>

        <form className="model-custom" onSubmit={handleCustom} noValidate>
          <label htmlFor="modello-libero" className="settings-label">
            Un modello che non è nell'elenco
          </label>
          <div className="model-custom-row">
            <input
              id="modello-libero"
              type="text"
              placeholder="fornitore/nome-del-modello"
              spellCheck={false}
              value={custom}
              aria-invalid={customError ? true : undefined}
              aria-describedby={customError ? "modello-libero-errore" : undefined}
              onChange={(e) => {
                setCustom(e.target.value);
                setCustomError(null);
              }}
            />
            <button type="submit" className="secondary" disabled={custom.trim() === ""}>
              Usa questo modello
            </button>
          </div>
          {customError && (
            <p id="modello-libero-errore" className="field-error">
              {customError}
            </p>
          )}
        </form>

        <h3 className="settings-label">Richiesta all'AI</h3>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={view.ai.showRequest}
            onChange={(e) => setShowRequest(e.target.checked)}
          />
          Mostra la richiesta prima di inviarla
        </label>
        <p className="small-text muted settings-note">
          Prima di ogni funzione AI si vede cosa verrà inviato al modello e si possono aggiungere
          indicazioni. Se è disattivata, la richiesta parte subito con le ultime indicazioni scritte
          per l'esercizio.
        </p>
      </section>

      <section className="settings-section" aria-labelledby="impostazioni-aggiornamenti">
        <h2 id="impostazioni-aggiornamenti">Aggiornamenti</h2>
        <p>
          Versione installata: <span className="mono">{version ?? "…"}</span>
        </p>
        {update?.mode === "none" ? (
          <p className="settings-lede">{update.reason}</p>
        ) : (
          update && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={view.updates.auto}
                  onChange={(e) => setAutoUpdate(e.target.checked)}
                />
                Aggiorna automaticamente
              </label>
              <p className="small-text muted settings-note">
                {update.mode === "auto"
                  ? "Controlla poco dopo l'avvio e poi ogni 6 ore; la versione nuova si scarica in " +
                    "silenzio e si installa alla chiusura dell'app."
                  : `Controlla poco dopo l'avvio e poi ogni 6 ore e segnala le versioni nuove. ${update.note ?? ""}`}
              </p>
              <div className="update-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => window.desktop.updates.check()}
                  disabled={["checking", "downloading", "ready"].includes(update.phase)}
                >
                  Controlla ora
                </button>
                <span aria-live="polite">{updateStatusText(update)}</span>
              </div>
              {update.phase === "ready" && (
                <div className="update-row">
                  <button
                    type="button"
                    className="primary"
                    onClick={onInstallUpdate}
                    disabled={installingUpdate}
                  >
                    {installingUpdate ? "Riavvio…" : "Riavvia ora"}
                  </button>
                  <span className="small-text muted">Il lavoro viene salvato prima di chiudere.</span>
                </div>
              )}
              {update.phase === "available" && (
                <div className="update-row">
                  <button type="button" className="secondary" onClick={() => window.open(update.downloadUrl)}>
                    Scarica la versione {update.version}
                  </button>
                </div>
              )}
            </>
          )
        )}
      </section>
    </article>
  );
}
