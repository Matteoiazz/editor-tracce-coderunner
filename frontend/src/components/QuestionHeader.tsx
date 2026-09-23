import type { ExamKind, NameParts } from "../naming";

interface Props {
  parts: NameParts;
  grade: number;
  name: string;
  onPartsChange: (parts: NameParts) => void;
  onGradeChange: (grade: number) => void;
}

/** Intestazione dell'esercizio: numero, data, tipo, punti e nome risultante. */
export function QuestionHeader({ parts, grade, name, onPartsChange, onGradeChange }: Props) {
  return (
    <div className="question-header">
      <div className="fields">
        <label>
          N°
          <input
            type="number"
            min={1}
            value={parts.number ?? ""}
            onChange={(e) =>
              onPartsChange({ ...parts, number: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
        <label>
          Data
          <input
            type="date"
            value={parts.date}
            onChange={(e) => onPartsChange({ ...parts, date: e.target.value })}
          />
        </label>
        <fieldset>
          {(["Esame", "Pretest"] as ExamKind[]).map((kind) => (
            <label key={kind}>
              <input
                type="radio"
                checked={parts.kind === kind}
                onChange={() => onPartsChange({ ...parts, kind })}
              />
              {kind}
            </label>
          ))}
        </fieldset>
        <label>
          Punti
          <input
            type="number"
            min={0}
            step={0.5}
            value={grade}
            onChange={(e) => onGradeChange(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="name">
        Nome: <code>{name}</code>
      </div>
    </div>
  );
}
