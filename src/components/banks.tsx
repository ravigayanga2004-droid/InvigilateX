"use client";
import { useState } from "react";
import { Plus, LibraryBig, Upload, Archive } from "lucide-react";
import { QuestionRow } from "@/lib/types";
import {
  api,
  useResource,
  useToast,
  Loading,
  Failure,
  Empty,
  Badge,
  Confirm,
} from "./ui";
type Bank = { id: string; title: string; _count: { questions: number } };
type Preview = {
  row: number;
  data: { text: string; type: string } | null;
  errors: string[];
};
export function Banks() {
  const banks = useResource<Bank[]>("banks");
  const [bankId, setBankId] = useState("");
  const questions = useResource<QuestionRow[]>(
    `questions${bankId ? `?bankId=${bankId}` : ""}`,
  );
  const [create, setCreate] = useState(false);
  const [revision, setRevision] = useState<QuestionRow | null>(null);
  const [type, setType] = useState("SINGLE_CHOICE");
  const [optionCount, setOptionCount] = useState(4);
  const [retire, setRetire] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState("json");
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (banks.loading) return <Loading />;
  if (banks.error)
    return <Failure message={banks.error} retry={banks.reload} />;
  return (
    <div className="stack">
      <div className="pagehead between" style={{ marginBottom: 0 }}>
        <div>
          <h1>Question banks</h1>
          <p>Build a thoughtful library. Reuse it with confidence.</p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setRevision(null);
            setCreate((v) => !v);
          }}
        >
          <Plus size={15} />
          {create ? "Close editor" : "Create question"}
        </button>
      </div>
      <section className="card">
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            try {
              const result = await api<{ id: string }>("banks", "POST", {
                title: fd.get("title"),
              });
              setBankId(result.id);
              form.reset();
              void banks.reload();
              toast("Question bank created.");
            } catch (e) {
              toast((e as Error).message, true);
            }
          }}
        >
          <LibraryBig size={21} color="var(--accent)" />
          <label className="field" style={{ flex: 1 }}>
            New bank title
            <input
              name="title"
              required
              minLength={3}
              placeholder="e.g. Computer science essentials"
            />
          </label>
          <button className="btn" style={{ alignSelf: "flex-end" }}>
            Add bank
          </button>
        </form>
        <label className="field" style={{ marginTop: 22 }}>
          Active bank
          <select
            value={bankId}
            onChange={(e) => {
              setBankId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">All banks — choose one to add questions</option>
            {banks.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b._count.questions})
              </option>
            ))}
          </select>
        </label>
      </section>
      {create && (
        <form
          key={revision?.id || "new"}
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const form = e.currentTarget;
            try {
              const fd = new FormData(form);
              const options = [
                "SINGLE_CHOICE",
                "MULTIPLE_CHOICE",
                "TRUE_FALSE",
              ].includes(type)
                ? Array.from(
                    { length: type === "TRUE_FALSE" ? 2 : optionCount },
                    (_, i) => ({
                      text: String(fd.get(`option-${i}`) || ""),
                      isCorrect: fd.has(`correct-${i}`),
                    }),
                  )
                : [];
              await api("questions", "POST", {
                questionBankId: bankId,
                type,
                text: fd.get("text"),
                explanation: fd.get("explanation"),
                difficulty: fd.get("difficulty"),
                topic: fd.get("topic"),
                points: Number(fd.get("points")),
                tags: String(fd.get("tags") || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                correctText:
                  type === "SHORT_ANSWER" ? fd.get("correctText") : null,
                options,
              });
              toast("Question created.");
              form.reset();
              setCreate(false);
              void questions.reload();
              void banks.reload();
            } catch (e) {
              toast((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>
            {revision ? "Revise question as a new version" : "Question editor"}
          </h2>
          {revision && (
            <div className="notice">
              Saving creates a revised copy. Existing exams and attempts keep
              their original question. Retire the old version when it should no
              longer be selected.
            </div>
          )}
          {!bankId && (
            <div className="notice">Select a bank above before saving.</div>
          )}
          <div className="grid2">
            <label className="field">
              Question type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {[
                  "SINGLE_CHOICE",
                  "MULTIPLE_CHOICE",
                  "TRUE_FALSE",
                  "SHORT_ANSWER",
                  "ESSAY",
                ].map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Points
              <input
                name="points"
                required
                type="number"
                min={0.01}
                step={0.01}
                max={1000}
                defaultValue={revision?.points || 1}
              />
            </label>
          </div>
          <label className="field">
            Question text
            <textarea
              name="text"
              required
              minLength={5}
              maxLength={10000}
              defaultValue={revision?.text}
            />
          </label>
          {["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(
            type,
          ) && (
            <div className="stack">
              <p className="muted" style={{ fontSize: 12 }}>
                Mark the correct option{type === "MULTIPLE_CHOICE" ? "s" : ""}.{" "}
                {type !== "MULTIPLE_CHOICE" &&
                  "Exactly one option must be correct."}
              </p>
              {Array.from(
                { length: type === "TRUE_FALSE" ? 2 : optionCount },
                (_, i) => (
                  <div className="row" key={`${type}-${i}`}>
                    <label className="checkbox">
                      <input
                        defaultChecked={revision?.options[i]?.isCorrect}
                        name={`correct-${i}`}
                        type="checkbox"
                        aria-label={`Option ${i + 1} is correct`}
                      />
                    </label>
                    <label className="field" style={{ flex: 1 }}>
                      Option {i + 1}
                      <input
                        name={`option-${i}`}
                        required
                        defaultValue={
                          revision?.options[i]?.text ||
                          (type === "TRUE_FALSE"
                            ? i === 0
                              ? "True"
                              : "False"
                            : "")
                        }
                      />
                    </label>
                  </div>
                ),
              )}
              {type !== "TRUE_FALSE" && (
                <div className="row">
                  <button
                    className="btn small"
                    type="button"
                    disabled={optionCount >= 10}
                    onClick={() => setOptionCount((n) => n + 1)}
                  >
                    Add option
                  </button>
                  <button
                    className="btn small"
                    type="button"
                    disabled={optionCount <= 2}
                    onClick={() => setOptionCount((n) => n - 1)}
                  >
                    Remove last option
                  </button>
                </div>
              )}
            </div>
          )}
          {type === "SHORT_ANSWER" && (
            <label className="field">
              Reference answer (normalized exact match)
              <input
                name="correctText"
                required
                defaultValue={revision?.correctText || ""}
              />
            </label>
          )}
          <div className="grid3">
            <label className="field">
              Difficulty
              <select
                name="difficulty"
                defaultValue={revision?.difficulty || "MEDIUM"}
              >
                <option>EASY</option>
                <option>MEDIUM</option>
                <option>HARD</option>
              </select>
            </label>
            <label className="field">
              Topic
              <input name="topic" defaultValue={revision?.topic} />
            </label>
            <label className="field">
              Tags (comma separated)
              <input name="tags" defaultValue={revision?.tags?.join(", ")} />
            </label>
          </div>
          <label className="field">
            Explanation / grading guidance
            <textarea name="explanation" defaultValue={revision?.explanation} />
          </label>
          <button className="btn primary" disabled={!bankId || busy}>
            {busy ? "Saving…" : "Save question"}
          </button>
        </form>
      )}
      <section className="card stack">
        <div className="between">
          <h2>Question library</h2>
          <span className="badge">{questions.data?.length || 0} SHOWN</span>
        </div>
        {questions.loading ? (
          <Loading />
        ) : questions.error ? (
          <Failure message={questions.error} retry={questions.reload} />
        ) : questions.data?.length ? (
          questions.data.map((q) => (
            <article className="builderitem" key={q.id}>
              <div className="between">
                <div className="row">
                  <Badge status={q.type} />
                  <small>
                    {q.difficulty} · {q.points} points
                  </small>
                </div>
                <div className="row">
                  <button
                    className="btn small"
                    onClick={() => {
                      setRevision(q);
                      setBankId(q.questionBankId);
                      setType(q.type);
                      setOptionCount(Math.max(2, q.options.length));
                      setCreate(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Revise
                  </button>
                  <button
                    className="iconbtn"
                    aria-label={`Retire ${q.text}`}
                    onClick={() => setRetire(q.id)}
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </div>
              <h3 style={{ margin: "12px 0" }}>{q.text}</h3>
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 11,
                    color: "var(--accent)",
                  }}
                >
                  View answer configuration & explanation
                </summary>
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  {q.options.map((o) => (
                    <p key={o.id}>
                      {o.isCorrect ? "✓ " : "○ "}
                      {o.text}
                    </p>
                  ))}
                  {q.correctText && <p>Reference: {q.correctText}</p>}
                  <p className="muted" style={{ marginTop: 10 }}>
                    {q.explanation || "No explanation provided."}
                  </p>
                </div>
              </details>
            </article>
          ))
        ) : (
          <Empty
            title="No questions yet"
            description="Create a question or import your existing collection below."
          />
        )}
      </section>
      <section className="card stack">
        <div className="row">
          <Upload size={20} color="var(--accent)" />
          <h2>Import questions</h2>
        </div>
        <p className="muted">
          Choose a bank, upload CSV or JSON, and inspect every row before
          confirming. Invalid imports make no changes.
        </p>
        <a href="/templates/questions.csv" className="btn" download>
          Download sample CSV
        </a>
        <div className="grid2">
          <label className="field">
            Format
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setPreview(null);
              }}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          <label className="field">
            Import file
            <input
              type="file"
              accept=".csv,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setContent(await file.text());
                  setPreview(null);
                }
              }}
            />
          </label>
        </div>
        <label className="field">
          Import content
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setPreview(null);
            }}
            placeholder={
              '[{"type":"ESSAY","text":"Explain your reasoning.","points":5}]'
            }
          />
        </label>
        <button
          className="btn"
          disabled={!bankId || !content || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api<{ preview: Preview[] }>(
                "questions/import",
                "POST",
                { format, content, bankId },
              );
              setPreview(result.preview);
            } catch (e) {
              toast((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          Validate & preview
        </button>
        {preview && (
          <>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Question</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.row}>
                      <td>{row.row}</td>
                      <td>{row.data?.text || "Invalid question"}</td>
                      <td>
                        {row.errors.length ? (
                          <span className="error">{row.errors.join("; ")}</span>
                        ) : (
                          <Badge status="PASSED" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="btn primary"
              disabled={busy || preview.some((r) => r.errors.length > 0)}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await api<{ imported: number }>(
                    "questions/import",
                    "POST",
                    { format, content, bankId, confirm: true },
                  );
                  toast(`${result.imported} questions imported.`);
                  setPreview(null);
                  setContent("");
                  void questions.reload();
                  void banks.reload();
                } catch (e) {
                  toast((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import all {preview.length} questions
            </button>
          </>
        )}
      </section>
      <Confirm
        open={!!retire}
        title="Retire question?"
        message="This hides the question from new selections. Existing examinations and frozen attempts retain their content."
        confirmLabel="Retire question"
        onClose={() => setRetire("")}
        onConfirm={async () => {
          try {
            await api(`questions/${retire}`, "PATCH", { isActive: false });
            toast("Question retired.");
            void questions.reload();
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      />
    </div>
  );
}
