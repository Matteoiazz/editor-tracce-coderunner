import type { ExamInfo, ExamKind } from "../naming";

interface Props {
  exam: ExamInfo;
  onChange: (exam: ExamInfo) => void;
}

/** Data e tipo dell'esame, comuni a tutti gli esercizi. */
export function ExamHeader({ exam, onChange }: Props) {
  return (
    <section className="exam-header">
      <h2>Esame</h2>
      <label>
        Data
        <input
          type="date"
          value={exam.date}
          onChange={(e) => onChange({ ...exam, date: e.target.value })}
        />
      </label>
      <fieldset>
        <span>Tipo</span>
        {(["Esame", "Pretest"] as ExamKind[]).map((kind) => (
          <label key={kind}>
            <input
              type="radio"
              name="exam-kind"
              checked={exam.kind === kind}
              onChange={() => onChange({ ...exam, kind })}
            />
            {kind}
          </label>
        ))}
      </fieldset>
    </section>
  );
}
