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
            type="number"
            min={1}
            value={number ?? ""}
            onChange={(e) => onNumberChange(e.target.value ? Number(e.target.value) : null)}
          />
        </label>
        {duplicate && <span className="error">Numero già usato da un altro esercizio</span>}
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
    </div>
  );
}
