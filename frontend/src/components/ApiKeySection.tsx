import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { keyDetails, keyProblem, newPasswordProblem, protectionText } from "../apiKey";
import { ipcErrorText } from "../settings";
import { IconCaret, IconCheck } from "./icons";
import { Menu } from "./Menu";

/** Operazioni che, con la chiave protetta, chiedono la master password attuale. */
type PasswordAction = "reveal" | "unlock" | "test" | "unprotect";

type Panel =
  | { kind: "save"; replacing: boolean }
  | { kind: "password"; action: PasswordAction }
  | { kind: "protect" }
  | { kind: "change" }
  | null;

const PASSWORD_ACTIONS: Record<PasswordAction, { title: string; submit: string }> = {
  reveal: { title: "Per vedere la chiave serve la master password.", submit: "Mostra la chiave" },
  unlock: { title: "Sblocca la chiave per questa sessione.", submit: "Sblocca" },
  test: { title: "Per provare la chiave serve la master password.", submit: "Prova la chiave" },
  unprotect: {
    title: "Togliendo la protezione la chiave non richiederà più la master password.",
    submit: "Togli la protezione",
  },
};

const FORGOTTEN =
  "Se dimentichi la master password non si può recuperare: si rimuove la chiave e se ne " +
  "inserisce una nuova.";

const WEAK_KEYCHAIN =
  "Su questo sistema non c'è un portachiavi: senza master password la chiave è conservata con " +
  "una protezione debole, leggibile da chi può aprire i tuoi file. Conviene proteggerla con una " +
  "master password.";

/** Chiave API di OpenRouter: salvataggio, eventuale master password, prova con OpenRouter.
 *  La chiave arriva alla pagina solo quando si chiede di vederla, e non viene conservata. */
export function ApiKeySection() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [check, setCheck] = useState<KeyCheck | null>(null);
  // Operazione in corso: blocca i pulsanti; "test" cambia il testo di "Prova la chiave"
  const [pending, setPending] = useState<"test" | "other" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    window.desktop.apiKey
      .status()
      .then(setStatus, (e) => setError(`Lettura della chiave non riuscita: ${ipcErrorText(e)}`));
  }, []);

  function open(next: Panel) {
    setPanel(next);
    setError(null);
    setNotice(null);
  }

  /** Esegue un'operazione bloccando i pulsanti; un errore si mostra sotto la chiave. */
  async function run<T>(action: () => Promise<T>, done: (value: T) => void, kind: "test" | "other" = "other") {
    setPending(kind);
    setError(null);
    setNotice(null);
    try {
      done(await action());
    } catch (e) {
      setError(ipcErrorText(e));
    } finally {
      setPending(null);
    }
  }

  // Dopo una prova o "Mostra" la chiave protetta può essere stata sbloccata
  const refresh = () => window.desktop.apiKey.status().then(setStatus, () => {});

  function testKey(password: string | null) {
    setCheck(null);
    run(
      () => window.desktop.apiKey.test(password),
      (result) => {
        setCheck(result);
        setPanel(null);
        refresh();
      },
      "test",
    );
  }

  function reveal(password: string | null) {
    run(
      () => window.desktop.apiKey.reveal(password),
      (key) => {
        setRevealed(key);
        setPanel(null);
        refresh();
      },
    );
  }

  function withPassword(action: PasswordAction, password: string) {
    const { apiKey } = window.desktop;
    if (action === "reveal") reveal(password);
    else if (action === "test") testKey(password);
    else if (action === "unlock") {
      run(() => apiKey.unlock(password), (next) => {
        setStatus(next);
        setPanel(null);
      });
    } else {
      run(() => apiKey.unprotect(password), (next) => {
        setStatus(next);
        setPanel(null);
        setNotice("Protezione tolta: la chiave non richiede più la master password.");
      });
    }
  }

  function remove() {
    if (!window.confirm("Rimuovere la chiave API? Per usare le funzioni AI andrà inserita di nuovo.")) return;
    run(() => window.desktop.apiKey.remove(), (next) => {
      setStatus(next);
      setPanel(null);
      setRevealed(null);
      setCheck(null);
      setNotice("Chiave rimossa.");
    });
  }

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setNotice("Chiave copiata negli appunti.");
    } catch {
      setError("Copia negli appunti non riuscita: seleziona la chiave e copiala a mano.");
    }
  }

  if (!status) {
    return (
      <div className="key-section">
        {error ? <p className="field-error">{error}</p> : <p className="muted">Caricamento…</p>}
      </div>
    );
  }

  const { apiKey } = window.desktop;
  const busy = pending !== null;
  const needsPassword = status.protected && !status.unlocked;
  const messages = (
    <>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="small-text muted" role="status">
          {notice}
        </p>
      )}
    </>
  );

  // Nessuna chiave, oppure si sta sostituendo quella salvata
  if (!status.saved || panel?.kind === "save") {
    return (
      <div className="key-section">
        <p className="settings-lede small-text">
          La chiave del tuo account OpenRouter: si crea su openrouter.ai, alla voce Keys.
        </p>
        <KeyForm
          initialProtect={status.protected}
          weakKeychain={status.weakKeychain}
          busy={busy}
          onCancel={status.saved ? () => open(null) : undefined}
          onSave={(key, password) =>
            run(() => apiKey.save(key, password), (next) => {
              setStatus(next);
              setPanel(null);
              setRevealed(null);
              setCheck(null);
              setNotice(password ? "Chiave salvata e protetta con la master password." : "Chiave salvata.");
            })
          }
        />
        {messages}
      </div>
    );
  }

  // File della chiave illeggibile: si può solo rimuovere
  if (status.problem) {
    return (
      <div className="key-section">
        <p className="inline-notice">{status.problem}.</p>
        <div className="key-actions">
          <button type="button" className="ghost small danger" onClick={remove} disabled={busy}>
            Rimuovi la chiave
          </button>
        </div>
        {messages}
      </div>
    );
  }

  return (
    <div className="key-section">
      <div className="key-current">
        <div className="key-current-info" aria-live="polite">
          <p className="mono key-value">{revealed ?? status.mask}</p>
          <p className="small-text muted">{protectionText(status)}</p>
        </div>
        {revealed && (
          <div className="key-actions">
            <button type="button" className="ghost small" onClick={() => copy(revealed)}>
              Copia
            </button>
            <button type="button" className="ghost small" onClick={() => setRevealed(null)}>
              Nascondi
            </button>
          </div>
        )}
      </div>

      {!status.protected && status.weakKeychain && <p className="inline-notice">{WEAK_KEYCHAIN}</p>}

      <div className="key-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => (needsPassword ? open({ kind: "password", action: "test" }) : testKey(null))}
        >
          {pending === "test" ? "Prova in corso…" : "Prova la chiave"}
        </button>
        {!revealed && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => (status.protected ? open({ kind: "password", action: "reveal" }) : reveal(null))}
          >
            Mostra
          </button>
        )}
        {status.protected &&
          (status.unlocked ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(() => apiKey.lock(), (next) => {
                  setStatus(next);
                  setRevealed(null);
                })
              }
            >
              Blocca
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => open({ kind: "password", action: "unlock" })}
            >
              Sblocca
            </button>
          ))}
        {/* Le azioni meno frequenti in un menu: protezione, sostituzione, rimozione */}
        <Menu
          label={
            <>
              Altro <IconCaret />
            </>
          }
          className="ghost"
          ariaLabel="Altre azioni sulla chiave"
          disabled={busy}
          groups={[
            {
              items: status.protected
                ? [
                    {
                      label: "Cambia master password",
                      onSelect: () => open({ kind: "change" }),
                    },
                    {
                      label: "Togli la protezione",
                      description: "La chiave torna nel portachiavi del sistema",
                      onSelect: () => open({ kind: "password", action: "unprotect" }),
                    },
                  ]
                : [
                    {
                      label: "Proteggi con password",
                      description: "Servirà una volta per sessione per usarla",
                      onSelect: () => open({ kind: "protect" }),
                    },
                  ],
            },
            {
              items: [
                {
                  label: "Sostituisci la chiave",
                  description: "Incolla una chiave nuova al posto di questa",
                  onSelect: () => open({ kind: "save", replacing: true }),
                },
                { label: "Rimuovi la chiave", danger: true, onSelect: remove },
              ],
            },
          ]}
        />
      </div>

      {panel?.kind === "password" && (
        <PasswordPanel
          title={PASSWORD_ACTIONS[panel.action].title}
          submit={PASSWORD_ACTIONS[panel.action].submit}
          busy={busy}
          onCancel={() => open(null)}
          onSubmit={(password) => withPassword(panel.action, password)}
        />
      )}
      {panel?.kind === "protect" && (
        <NewPasswordPanel
          title="Con la master password la chiave è cifrata: servirà per vederla e, una volta per sessione, per usarla."
          submit="Proteggi la chiave"
          askCurrent={false}
          busy={busy}
          onCancel={() => open(null)}
          onSubmit={(_current, password) =>
            run(() => apiKey.protect(password), (next) => {
              setStatus(next);
              setPanel(null);
              setNotice("Chiave protetta con la master password.");
            })
          }
        />
      )}
      {panel?.kind === "change" && (
        <NewPasswordPanel
          title="Cambia la master password della chiave."
          submit="Cambia master password"
          askCurrent
          busy={busy}
          onCancel={() => open(null)}
          onSubmit={(current, password) =>
            run(() => apiKey.changePassword(current, password), (next) => {
              setStatus(next);
              setPanel(null);
              setNotice("Master password cambiata.");
            })
          }
        />
      )}

      {messages}
      {check && <CheckResult check={check} />}
    </div>
  );
}

function CheckResult({ check }: { check: KeyCheck }) {
  if (check.outcome !== "valid") return <p className="inline-notice">{check.message}.</p>;
  return (
    <div className="key-check" role="status">
      <IconCheck />
      <div>
        <p>
          <strong>La chiave è valida.</strong>
        </p>
        {keyDetails(check).map((line) => (
          <p key={line} className="small-text">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
  type?: "password" | "text";
  className?: string;
}

function Field({ id, label, value, onChange, autoFocus, invalid, type = "password", className }: FieldProps) {
  return (
    <label className="key-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type={type}
        className={className}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function FormButtons({ submit, busy, onCancel }: { submit: string; busy: boolean; onCancel?: () => void }) {
  return (
    <div className="key-actions">
      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Attendi…" : submit}
      </button>
      {onCancel && (
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Annulla
        </button>
      )}
    </div>
  );
}

function PanelForm({ title, children, onSubmit }: { title: string; children: ReactNode; onSubmit: () => void }) {
  return (
    <form
      className="key-panel"
      noValidate
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p>{title}</p>
      {children}
    </form>
  );
}

function KeyForm(props: {
  initialProtect: boolean;
  weakKeychain: boolean;
  busy: boolean;
  onCancel?: () => void;
  onSave: (key: string, password: string | null) => void;
}) {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [protect, setProtect] = useState(props.initialProtect);
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const found = keyProblem(key) ?? (protect ? newPasswordProblem(password, repeated) : null);
    setProblem(found);
    if (!found) props.onSave(key.trim(), protect ? password : null);
  }

  return (
    <form
      className="key-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="key-input-row">
        <Field
          id="chiave-api"
          label="Chiave"
          type={showKey ? "text" : "password"}
          className="mono"
          value={key}
          autoFocus={props.onCancel !== undefined}
          invalid={problem !== null && keyProblem(key) !== null}
          onChange={(value) => {
            setKey(value);
            setProblem(null);
          }}
        />
        <button type="button" className="ghost small" onClick={() => setShowKey((v) => !v)}>
          {showKey ? "Nascondi" : "Mostra"}
        </button>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />
        Proteggi con password
      </label>
      {protect ? (
        <div className="key-protect">
          <div className="key-input-row">
            <Field
              id="master-password"
              label="Master password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setProblem(null);
              }}
            />
            <Field
              id="master-password-ripetuta"
              label="Ripeti la master password"
              value={repeated}
              onChange={(value) => {
                setRepeated(value);
                setProblem(null);
              }}
            />
          </div>
          <p className="small-text muted">
            Almeno 8 caratteri. Servirà per vedere la chiave e, una volta per sessione, per usarla.{" "}
            {FORGOTTEN}
          </p>
        </div>
      ) : (
        props.weakKeychain && <p className="inline-notice">{WEAK_KEYCHAIN}</p>
      )}
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      <FormButtons submit="Salva la chiave" busy={props.busy} onCancel={props.onCancel} />
    </form>
  );
}

function PasswordPanel(props: {
  title: string;
  submit: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <PanelForm title={props.title} onSubmit={() => password !== "" && props.onSubmit(password)}>
      <Field id="master-password-attuale" label="Master password" value={password} onChange={setPassword} autoFocus />
      <p className="small-text muted">{FORGOTTEN}</p>
      <FormButtons submit={props.submit} busy={props.busy} onCancel={props.onCancel} />
    </PanelForm>
  );
}

function NewPasswordPanel(props: {
  title: string;
  submit: string;
  askCurrent: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (current: string, password: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const found =
      props.askCurrent && current === "" ? "Scrivi la master password attuale" : newPasswordProblem(password, repeated);
    setProblem(found);
    if (!found) props.onSubmit(current, password);
  }

  return (
    <PanelForm title={props.title} onSubmit={submit}>
      {props.askCurrent && (
        <Field
          id="master-password-attuale"
          label="Master password attuale"
          value={current}
          onChange={setCurrent}
          autoFocus
        />
      )}
      <div className="key-input-row">
        <Field
          id="master-password-nuova"
          label="Nuova master password"
          value={password}
          onChange={setPassword}
          autoFocus={!props.askCurrent}
        />
        <Field id="master-password-nuova-ripetuta" label="Ripetila" value={repeated} onChange={setRepeated} />
      </div>
      <p className="small-text muted">Almeno 8 caratteri. {FORGOTTEN}</p>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      <FormButtons submit={props.submit} busy={props.busy} onCancel={props.onCancel} />
    </PanelForm>
  );
}
