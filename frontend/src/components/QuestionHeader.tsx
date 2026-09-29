import { isValidGrade, parseExerciseNumber } from "../exam";

interface Props {
  name: string;
  number: number | null;
  grade: number;
  duplicate: boolean;
  onNumberChange: (number: number | null) => void;
  onGradeChange: (grade: number) => void;
  onRemove: () => void;
}

/** Intestazione dell'esercizio: nome, numero, punti e rimozione. */
export function QuestionHeader(props: Props) {
  const { name, number, grade, duplicate, onNumberChange, onGradeChange, onRemove } = props;
  return (
    <div className="question-header">
      <div className="title-row">
        <h2>{name}</h2>
        <button type="button" className="danger" onClick={onRemove}>
          Rimuovi
        </button>
      </div>
      <div className="fields">
        <label>
          N°
          <input
            type="text"
            inputMode="numeric"
            className="number-input"
            value={number ?? ""}
            onChange={(e) => onNumberChange(parseExerciseNumber(e.target.value))}
          />
        </label>
        {number === null && <span className="error">Indica il numero dell'esercizio</span>}
        {duplicate && <span className="error">Numero già usato da un altro esercizio</span>}
        <label>
          Punti
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={Number.isFinite(grade) ? grade : ""}
            onChange={(e) => onGradeChange(e.target.value === "" ? 0 : Number(e.target.value))}
          />
        </label>
        {!isValidGrade(grade) && <span className="error">I punti devono essere maggiori di 0</span>}
      </div>
    </div>
  );
}
