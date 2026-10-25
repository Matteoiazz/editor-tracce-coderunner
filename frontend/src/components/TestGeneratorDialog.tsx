import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  generateCommonTests,
  generatedCount,
  generatedSizes,
  type GeneratorParams,
  generatorErrors,
  nextSeed,
  type TestRow,
} from "../testcases";

interface Props {
  /** Test comuni attuali: i seed dei nuovi continuano dopo i loro, se si aggiungono. */
  rows: TestRow[];
  onGenerate: (rows: TestRow[]) => void;
  onClose: () => void;
}

// Valori del modulo come testo: un campo vuoto o non numerico viene segnalato, non corretto
interface Form {
  start: string;
  end: string;
  step: string;
  count: string;
  mode: GeneratorParams["mode"];
  visibility: GeneratorParams["visibility"];
  replace: boolean;
}

const INITIAL: Form = {
  start: "0",
  end: "100",
  step: "10",
  count: "1",
  mode: "perStep",
  visibility: "visible",
  replace: false,
};

const PREVIEW_COUNT = 6;

function toNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

/** Finestra per generare test comuni su un intervallo di dimensioni. */
export function TestGeneratorDialog({ rows, onGenerate, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Form>(INITIAL);

  // Finestra modale del browser: blocca il resto della pagina e si chiude con Esc
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const params: GeneratorParams = {
    start: toNumber(form.start),
    end: toNumber(form.end),
    step: toNumber(form.step),
    count: toNumber(form.count),
    mode: form.mode,
    visibility: form.visibility,
  };
  const errors = generatorErrors(params);
  const valid = Object.keys(errors).length === 0;
  const replacing = form.replace && rows.length > 0;
  const firstSeed = replacing ? 0 : nextSeed(rows);
  const total = valid ? generatedCount(params) : 0;
  const sizes = valid ? generatedSizes(params) : [];

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    if (
      replacing &&
      !window.confirm(
        `Sostituire i ${rows.length} test comuni con i ${total} generati? ` +
          "Negli esercizi gli output dei test comuni andranno ricalcolati.",
      )
    ) {
      return;
    }
    const generated = generateCommonTests(params, firstSeed);
    onGenerate(replacing ? generated : [...rows, ...generated]);
    onClose();
  }

  const numberField = (key: "start" | "end" | "step" | "count", label: string) => (
    <label className="generator-field" htmlFor={`generatore-${key}`}>
      <span>{label}</span>
      <input
        id={`generatore-${key}`}
        type="text"
        inputMode="numeric"
        value={form[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `generatore-${key}-errore` : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
      {errors[key] && (
        <span id={`generatore-${key}-errore`} className="error">
          {errors[key]}
        </span>
      )}
    </label>
  );

  return (
    <dialog ref={dialogRef} className="generator-dialog" onClose={onClose} aria-labelledby="generatore-titolo">
      <form onSubmit={handleSubmit}>
        <h2 id="generatore-titolo">Genera test comuni</h2>
        <p className="muted small-text">
          Ogni test ha come input un seed e una dimensione, su due righe, come i 9 test standard.
        </p>

        <fieldset>
          <legend>Dimensione</legend>
          <div className="generator-row">
            {numberField("start", "Da")}
            {numberField("end", "A")}
            {numberField("step", "Passo")}
          </div>
        </fieldset>

        <fieldset>
          <legend>Quanti test</legend>
          <div className="generator-row">
            {numberField("count", "Numero")}
            <div className="generator-choices" role="radiogroup" aria-label="Il numero vale">
              <label className="checkbox">
                <input
                  type="radio"
                  name="generatore-modo"
                  checked={form.mode === "perStep"}
                  onChange={() => set("mode", "perStep")}
                />
                per ogni passo
              </label>
              <label className="checkbox">
                <input
                  type="radio"
                  name="generatore-modo"
                  checked={form.mode === "total"}
                  onChange={() => set("mode", "total")}
                />
                in totale, distribuiti sul range
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Visibilità</legend>
          <div className="generator-choices horizontal" role="radiogroup" aria-label="Visibilità">
            {(
              [
                ["visible", "Visibili"],
                ["hidden", "Nascosti"],
                ["random", "A caso"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="checkbox">
                <input
                  type="radio"
                  name="generatore-visibilita"
                  checked={form.visibility === value}
                  onChange={() => set("visibility", value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {rows.length > 0 && (
          <fieldset>
            <legend>Test comuni già presenti ({rows.length})</legend>
            <div className="generator-choices horizontal" role="radiogroup" aria-label="Test già presenti">
              <label className="checkbox">
                <input
                  type="radio"
                  name="generatore-azione"
                  checked={!form.replace}
                  onChange={() => set("replace", false)}
                />
                Aggiungi in fondo
              </label>
              <label className="checkbox">
                <input
                  type="radio"
                  name="generatore-azione"
                  checked={form.replace}
                  onChange={() => set("replace", true)}
                />
                Sostituiscili
              </label>
            </div>
          </fieldset>
        )}

        <div className="generator-preview" aria-live="polite">
          {valid ? (
            <>
              <p>
                <strong>{total === 1 ? "Verrà creato 1 test" : `Verranno creati ${total} test`}</strong>
                {total > 1 && (
                  <>
                    : seed da {firstSeed} a {firstSeed + total - 1}, dimensioni da {sizes[0]} a{" "}
                    {sizes[sizes.length - 1]}
                  </>
                )}
                .
              </p>
              <ul className="generator-samples mono">
                {sizes.slice(0, PREVIEW_COUNT).map((size, i) => (
                  <li key={i}>
                    {firstSeed + i} / {size}
                  </li>
                ))}
                {total > PREVIEW_COUNT && <li className="muted">…</li>}
              </ul>
            </>
          ) : (
            <p className="muted">Correggi i valori evidenziati per vedere l'anteprima.</p>
          )}
        </div>

        <div className="generator-actions">
          <button type="button" className="ghost" onClick={() => dialogRef.current?.close()}>
            Annulla
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            {replacing ? "Genera e sostituisci" : "Genera"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
