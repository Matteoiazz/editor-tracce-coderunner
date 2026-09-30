import { TEST_STATE_LABEL, type TestState } from "../status";

interface Props {
  states: TestState[];
  /** Cambia quando arrivano nuovi esiti: i puntini si riempiono in sequenza. */
  revealKey?: string;
}

const STATE_ORDER: TestState[] = ["passed", "failed", "unverified", "pending"];

/** Fila di puntini, uno per test: la forma distingue lo stato anche senza colore
 *  (pieno superato, croce fallito, pieno chiaro da verificare, vuoto da calcolare). */
export function StatusDots({ states, revealKey }: Props) {
  const counts = STATE_ORDER.filter((s) => states.includes(s))
    .map((s) => `${states.filter((x) => x === s).length} ${TEST_STATE_LABEL[s]}`)
    .join(", ");
  return (
    <span className="status-dots" role="img" aria-label={counts || "nessun test"} key={revealKey}>
      {states.map((state, i) => (
        <svg
          key={i}
          className={`dot dot-${state}`}
          width="9"
          height="9"
          viewBox="0 0 9 9"
          aria-hidden="true"
          style={{ animationDelay: `${i * 22}ms` }}
        >
          {state === "failed" ? (
            <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" />
          ) : state === "pending" ? (
            <circle cx="4.5" cy="4.5" r="3" />
          ) : (
            <circle cx="4.5" cy="4.5" r="3.5" />
          )}
        </svg>
      ))}
    </span>
  );
}
