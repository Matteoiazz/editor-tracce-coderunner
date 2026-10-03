import { useState } from "react";
import { isValidGrade, parseExerciseNumber, parseTags } from "../exam";
import type { ExamKind } from "../naming";
import { IconCopy, IconTrash } from "./icons";

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
  canDuplicate: boolean;
  onDuplicate: () => void;
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
        <h1 className="mono">{name}</h1>
        <div className="title-actions">
          {props.canDuplicate && (
            <button
              type="button"
              className="ghost"
              onClick={props.onDuplicate}
              title="Crea un nuovo esercizio con lo stesso testo, codice e test, da modificare"
            >
              <IconCopy /> Duplica
            </button>
          )}
          <button type="button" className="ghost danger" onClick={onRemove}>
            <IconTrash /> Rimuovi
          </button>
        </div>
      </div>
      <div className="fields">
        {examKind !== "Pretest" && (
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
        )}
        {examKind !== "Pretest" && number === null && (
          <span className="error">Indica il numero dell'esercizio</span>
        )}
        {examKind !== "Pretest" && duplicate && (
          <span className="error">Numero già usato da un altro esercizio</span>
        )}
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
