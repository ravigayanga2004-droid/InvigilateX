"use client";
import { useEffect, useRef, useState } from "react";
import { api, useResource, useToast, Loading, Failure } from "./ui";
export type CreatedQuestion = {
  id: string;
  text: string;
  type: string;
  points: string;
  difficulty: string;
};
export function QuickQuestion({
  onCreated,
  onClose,
}: {
  onCreated: (q: CreatedQuestion) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const banks = useResource<{ id: string; title: string }[]>("banks");
  const [type, setType] = useState("SINGLE_CHOICE");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      style={{ maxWidth: 650 }}
      onCancel={onClose}
      aria-labelledby="quick-question-title"
    >
      <div className="between">
        <h2 id="quick-question-title">Create a question</h2>
        <button type="button" className="btn small" onClick={onClose}>
          Close
        </button>
      </div>
      <p>Save to your bank and add it directly to this draft.</p>
      {banks.loading ? (
        <Loading />
      ) : banks.error ? (
        <Failure message={banks.error} retry={banks.reload} />
      ) : !banks.data?.length ? (
        <div className="notice">
          Create a bank in Question banks first. Your exam draft stays open in
          this tab.
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const fd = new FormData(e.currentTarget);
              const choice = [
                "SINGLE_CHOICE",
                "MULTIPLE_CHOICE",
                "TRUE_FALSE",
              ].includes(type);
              const options = choice
                ? Array.from(
                    { length: type === "TRUE_FALSE" ? 2 : 4 },
                    (_, i) => ({
                      text: String(fd.get(`option-${i}`) || ""),
                      isCorrect: fd.has(`correct-${i}`),
                    }),
                  )
                : [];
              const question = await api<CreatedQuestion>("questions", "POST", {
                questionBankId: fd.get("bankId"),
                type,
                text: fd.get("text"),
                points: Number(fd.get("points")),
                difficulty: fd.get("difficulty"),
                explanation: fd.get("explanation"),
                correctText:
                  type === "SHORT_ANSWER" ? fd.get("correctText") : null,
                options,
              });
              onCreated(question);
              onClose();
              toast("Question created and added to your draft.");
            } catch (error) {
              toast((error as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid2">
            <label className="field">
              Question bank
              <select name="bankId">
                {banks.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {[
                  "SINGLE_CHOICE",
                  "MULTIPLE_CHOICE",
                  "TRUE_FALSE",
                  "SHORT_ANSWER",
                  "ESSAY",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            Question text
            <textarea name="text" required minLength={5} />
          </label>
          {["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(
            type,
          ) && (
            <fieldset
              className="stack"
              style={{ border: 0, padding: 0 }}
              key={type}
            >
              <legend className="muted" style={{ fontSize: 11 }}>
                Mark correct answers. Single choice and true/false need exactly
                one correct option.
              </legend>
              {Array.from({ length: type === "TRUE_FALSE" ? 2 : 4 }, (_, i) => (
                <div className="row" key={i}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name={`correct-${i}`}
                      aria-label={`Option ${i + 1} is correct`}
                    />
                  </label>
                  <label className="field" style={{ flex: 1 }}>
                    Option {i + 1}
                    <input
                      name={`option-${i}`}
                      required
                      defaultValue={
                        type === "TRUE_FALSE" ? (i ? "False" : "True") : ""
                      }
                    />
                  </label>
                </div>
              ))}
            </fieldset>
          )}
          {type === "SHORT_ANSWER" && (
            <label className="field">
              Reference answer
              <input name="correctText" required />
            </label>
          )}
          <div className="grid2">
            <label className="field">
              Points
              <input
                name="points"
                type="number"
                min={0.01}
                max={1000}
                step={0.01}
                required
                defaultValue={1}
              />
            </label>
            <label className="field">
              Difficulty
              <select name="difficulty">
                <option>EASY</option>
                <option>MEDIUM</option>
                <option>HARD</option>
              </select>
            </label>
          </div>
          <label className="field">
            Explanation
            <textarea name="explanation" />
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Create & add question"}
          </button>
        </form>
      )}
    </dialog>
  );
}
