import { useState } from "react";
import { isValidGrade, parseExerciseNumber, parseTags } from "../exam";
import type { ExamKind } from "../naming";

interface Props {
  name: string;
  number: number | null;
  grade: number;
  tags: string[];
  examKind: ExamKind | null;
  duplicate: boolean;
  onNumberChange: (number: number | null) => void;
  onGradeChange: (grade: number) => void;
  onTagsChange: (tags: string[]) => void;
  onRemove: () => void;
}

/** Intestazione dell'esercizio: nome, numero, punti, tag e rimozione. */
export function QuestionHeader(props: Props) {
  const { name, number, grade, tags, examKind, duplicate } = props;
  const { onNumberChange, onGradeChange, onTagsChange, onRemove } = props;
  // Il testo del campo è tenuto a parte: altrimenti una virgola appena digitata
  // sparirebbe subito, perché un tag vuoto viene scartato.
  const [tagsText, setTagsText] = useState(tags.join(", "));

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
        <label className="tags-field">
          Tag
          <input
            type="text"
            value={tagsText}
            placeholder={examKind ? `se vuoto: «${examKind}»` : "es. Python - easy"}
            title="Tag della domanda su Moodle, separati da virgola (es. Python - easy, liste)"
            onChange={(e) => {
              setTagsText(e.target.value);
              onTagsChange(parseTags(e.target.value));
            }}
          />
        </label>
      </div>
    </div>
  );
}
