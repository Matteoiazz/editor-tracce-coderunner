import type { SectionState } from "../status";
import { IconCheck, IconCross, IconTodo, IconWarning } from "./icons";

const LABEL: Record<SectionState, string> = {
  done: "completo",
  todo: "da fare",
  warning: "da controllare",
  error: "da correggere",
};

/** Icona e nome dello stato di una sezione (mai solo colore). */
export function SectionStateIcon({ state }: { state: SectionState }) {
  const Icon =
    state === "done"
      ? IconCheck
      : state === "error"
        ? IconCross
        : state === "warning"
          ? IconWarning
          : IconTodo;
  return (
    <span className={`section-state state-${state}`}>
      <Icon size={14} />
      <span className="visually-hidden">{LABEL[state]}</span>
    </span>
  );
}
