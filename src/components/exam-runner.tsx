"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Clock3,
  Flag,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  WifiOff,
  Maximize,
  Send,
} from "lucide-react";
import { AttemptData } from "@/lib/types";
import {
  api,
  useResource,
  Loading,
  Failure,
  useToast,
  Confirm,
  ThemeToggle,
} from "./ui";
type LocalAnswer = {
  questionId: string;
  text: string;
  optionIds: string[];
  revision: number;
  flagged: boolean;
};
export function ExamRunner({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource<AttemptData>(
    `attempts/${id}`,
  );
  if (loading)
    return (
      <main className="exam-shell">
        <Loading />
      </main>
    );
  if (error || !data)
    return (
      <main className="exam-shell">
        <Failure message={error} retry={reload} />
      </main>
    );
  if (data.status !== "IN_PROGRESS")
    return (
      <main id="main-content" className="legal card">
        <ShieldCheck size={40} color="var(--accent)" />
        <h1 style={{ margin: "20px 0" }}>Your answers are submitted.</h1>
        <p>
          The server has safely recorded this attempt.{" "}
          {data.released
            ? "Your results are ready."
            : "Your instructor will release your results after review."}
        </p>
        <Link href={`/dashboard/attempts/${id}`} className="btn primary">
          View submission
        </Link>
      </main>
    );
  return <RunningAttempt initial={data} />;
}
function RunningAttempt({ initial }: { initial: AttemptData }) {
  const router = useRouter();
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState("All changes saved");
  const [remaining, setRemaining] = useState(
    Math.max(
      0,
      new Date(initial.expiresAt).getTime() -
        new Date(initial.serverTime).getTime(),
    ),
  );
  const initialAnswers = Object.fromEntries(
    initial.questions.map((q) => [
      q.id,
      {
        questionId: q.id,
        text: q.answer?.text || "",
        optionIds: q.answer?.optionIds || [],
        revision: q.answer?.revision || 0,
        flagged: q.flagged,
      },
    ]),
  );
  const [answers, setAnswers] =
    useState<Record<string, LocalAnswer>>(initialAnswers);
  const answerRef = useRef(answers);
  const pending = useRef(new Map<string, LocalAnswer>());
  const saving = useRef<Promise<void> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitting = useRef(false);
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const changes = useRef<number[]>([]);
  const activity = useRef(0);
  const sync = useRef({
    server: new Date(initial.serverTime).getTime(),
    local: 0,
  });
  const log = useCallback(
    (eventType: string) => {
      if (initial.integrityEnabled && !submitting.current)
        void api(`attempts/${initial.id}/events`, "POST", { eventType }).catch(
          () => {},
        );
    },
    [initial.id, initial.integrityEnabled],
  );
  const flush = useCallback(async () => {
    if (saving.current) return saving.current;
    const operation = (async () => {
      while (pending.current.size) {
        if (!navigator.onLine)
          throw new Error(
            "You’re offline. Keep this page open so your answers can retry.",
          );
        const [key, value] = pending.current.entries().next().value!;
        setSaveState("Saving answers…");
        await api(`attempts/${initial.id}/answer`, "POST", value);
        if (pending.current.get(key)?.revision === value.revision)
          pending.current.delete(key);
      }
      setSaveState("All changes saved");
    })();
    saving.current = operation;
    try {
      await operation;
    } finally {
      saving.current = null;
    }
  }, [initial.id]);
  const save = useCallback(() => {
    void flush().catch(() => setSaveState("Not saved yet · retrying"));
  }, [flush]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (pending.current.size) save();
    }, 5000);
    return () => clearInterval(timer);
  }, [save]);
  function update(questionId: string, patch: Partial<LocalAnswer>) {
    const current = answerRef.current[questionId];
    const next = { ...current, ...patch, revision: current.revision + 1 };
    answerRef.current = { ...answerRef.current, [questionId]: next };
    setAnswers(answerRef.current);
    pending.current.set(questionId, next);
    setSaveState("Unsaved changes");
    activity.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 650);
    const now = Date.now();
    changes.current = changes.current.filter((t) => now - t < 10000);
    changes.current.push(now);
    if (changes.current.length === 15) log("RAPID_CHANGES");
  }
  const submit = useCallback(async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const serverNow =
        sync.current.server + (performance.now() - sync.current.local);
      if (serverNow < new Date(initial.expiresAt).getTime()) await flush();
      await api(`attempts/${initial.id}/submit`, "POST", {});
      pending.current.clear();
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      router.push(`/dashboard/attempts/${initial.id}`);
      router.refresh();
    } catch (e) {
      submitting.current = false;
      setBusy(false);
      toast((e as Error).message, true);
    }
  }, [flush, initial.expiresAt, initial.id, router, toast]);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);
  useEffect(() => {
    sync.current.local = performance.now();
    activity.current = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        new Date(initial.expiresAt).getTime() -
          (sync.current.server + performance.now() - sync.current.local),
      );
      setRemaining(left);
      if (left === 0) void submitRef.current();
    }, 1000);
    return () => {
      clearInterval(timer);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [initial.expiresAt]);
  useEffect(() => {
    log("REFRESH");
    const hidden = () => {
      if (document.hidden) log("TAB_HIDDEN");
    };
    const blur = () => log("BLUR");
    const fullscreen = () =>
      log(document.fullscreenElement ? "FULLSCREEN_ENTER" : "FULLSCREEN_EXIT");
    const off = () => {
      setOnline(false);
      log("OFFLINE");
    };
    const on = () => {
      setOnline(true);
      log("ONLINE");
      save();
    };
    const copy = () => log("COPY");
    const paste = () => log("PASTE");
    const cut = () => log("CUT");
    const context = () => log("CONTEXT_MENU");
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current.size) {
        e.preventDefault();
      }
    };
    const active = () => {
      activity.current = Date.now();
    };
    const inactivity = setInterval(() => {
      if (Date.now() - activity.current > 180000) {
        log("INACTIVITY");
        activity.current = Date.now();
      }
    }, 60000);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blur);
    document.addEventListener("fullscreenchange", fullscreen);
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    document.addEventListener("copy", copy);
    document.addEventListener("paste", paste);
    document.addEventListener("cut", cut);
    document.addEventListener("contextmenu", context);
    window.addEventListener("beforeunload", before);
    document.addEventListener("pointerdown", active);
    document.addEventListener("keydown", active);
    return () => {
      clearInterval(inactivity);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
      document.removeEventListener("fullscreenchange", fullscreen);
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
      document.removeEventListener("copy", copy);
      document.removeEventListener("paste", paste);
      document.removeEventListener("cut", cut);
      document.removeEventListener("contextmenu", context);
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("pointerdown", active);
      document.removeEventListener("keydown", active);
    };
  }, [log, save]);
  const q = initial.questions[index];
  const value = answers[q.id];
  const completed = Object.values(answers).filter(
    (a) => a.text.trim() || a.optionIds.length,
  ).length;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return (
    <main id="main-content" className="exam-shell">
      <header className="between wrap card">
        <div className="row">
          <span className="brandmark">
            <ShieldCheck size={22} />
          </span>
          <div>
            <strong>{initial.title}</strong>
            <p className="muted" style={{ fontSize: 11 }}>
              Focused assessment workspace
            </p>
          </div>
        </div>
        <div className="row">
          <span className="row muted" role="status" style={{ fontSize: 11 }}>
            {online ? <CheckCheck size={15} /> : <WifiOff size={15} />}{" "}
            {online ? saveState : "Offline · answers awaiting connection"}
          </span>
          <ThemeToggle />
        </div>
      </header>
      {!online && (
        <div className="notice" role="alert" style={{ marginTop: 18 }}>
          You’re offline. Keep this page open. Answers will retry when your
          connection returns; the exam clock continues.
        </div>
      )}
      {initial.requireFullscreen && (
        <div className="notice between wrap" style={{ marginTop: 18 }}>
          Fullscreen is requested for this examination. Exits are recorded for
          human review.
          <button
            className="btn small"
            onClick={() =>
              void document.documentElement
                .requestFullscreen()
                .catch(() =>
                  toast("Fullscreen is unavailable in this browser.", true),
                )
            }
          >
            <Maximize size={13} />
            Enter fullscreen
          </button>
        </div>
      )}
      <div className="examgrid">
        <section className="card stack">
          <div className="between">
            <span className="eyebrow">
              QUESTION {index + 1} OF {initial.questions.length}
            </span>
            <button
              className={`btn small ${value.flagged ? "primary" : ""}`}
              onClick={() => update(q.id, { flagged: !value.flagged })}
            >
              <Flag size={13} />
              {value.flagged ? "Flagged for review" : "Flag for review"}
            </button>
          </div>
          <div className="row">
            <span className="badge">{q.type.replaceAll("_", " ")}</span>
            <small>{q.points} points</small>
          </div>
          <h2
            style={{
              fontSize: 21,
              whiteSpace: "pre-wrap",
              margin: "10px 0 8px",
            }}
          >
            {q.text}
          </h2>
          <fieldset
            style={{ border: 0, padding: 0, margin: 0 }}
            disabled={busy || remaining === 0}
          >
            <legend className="sr-only">Answer question {index + 1}</legend>
            {q.options.map((o) => (
              <label className="answer-option" key={o.id}>
                <input
                  type={q.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"}
                  name={q.id}
                  value={o.id}
                  checked={value.optionIds.includes(o.id)}
                  onChange={(e) =>
                    update(q.id, {
                      optionIds:
                        q.type === "MULTIPLE_CHOICE"
                          ? e.target.checked
                            ? [...value.optionIds, o.id]
                            : value.optionIds.filter((v) => v !== o.id)
                          : [o.id],
                    })
                  }
                />
                <span>{o.text}</span>
              </label>
            ))}
            {["SHORT_ANSWER", "ESSAY"].includes(q.type) && (
              <label className="field">
                Your answer
                <textarea
                  className="input"
                  style={{ minHeight: q.type === "ESSAY" ? 240 : 100 }}
                  maxLength={20000}
                  value={value.text}
                  onChange={(e) => update(q.id, { text: e.target.value })}
                  placeholder="Write your response here…"
                />
              </label>
            )}
          </fieldset>
          {q.type === "MULTIPLE_CHOICE" && (
            <p className="muted" style={{ fontSize: 11 }}>
              Select all correct answers. Correct selections earn partial
              credit; incorrect selections subtract credit, down to zero.
            </p>
          )}
          <div
            className="between"
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 22,
              marginTop: 15,
            }}
          >
            <button
              className="btn"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <button
              className="btn primary"
              disabled={index === initial.questions.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next question
              <ChevronRight size={15} />
            </button>
          </div>
        </section>
        <aside className="stack" style={{ alignContent: "start" }}>
          <section className="card">
            <div className="row muted" style={{ fontSize: 11 }}>
              <Clock3 size={15} />
              TIME REMAINING
            </div>
            <div
              className={`timer ${remaining < 300000 ? "urgent" : ""}`}
              role="timer"
              aria-label={`${minutes} minutes ${seconds} seconds remaining`}
            >
              {String(minutes).padStart(2, "0")}:
              {String(seconds).padStart(2, "0")}
            </div>
            <div className="progress">
              <span
                style={{
                  width: `${(completed / initial.questions.length) * 100}%`,
                }}
              />
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 9 }}>
              {completed} of {initial.questions.length} answered
            </p>
            <div className="question-nav" aria-label="Question navigation">
              {initial.questions.map((item, i) => (
                <button
                  key={item.id}
                  aria-label={`Question ${i + 1}${answers[item.id].flagged ? ", flagged" : ""}`}
                  aria-current={i === index ? "step" : undefined}
                  className={`${i === index ? "current" : ""} ${answers[item.id].text || answers[item.id].optionIds.length ? "answered" : ""} ${answers[item.id].flagged ? "flagged" : ""}`}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              className="btn primary"
              style={{ width: "100%" }}
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              <Send size={14} />
              {busy ? "Submitting…" : "Submit examination"}
            </button>
          </section>
          <div className="notice">
            <ShieldCheck size={20} style={{ marginBottom: 7 }} />
            <p>
              {initial.integrityEnabled
                ? "Browser activity is recorded. These signals support fair review and never change your grade."
                : "Browser activity recording is disabled for this examination."}
            </p>
          </div>
          <details className="card">
            <summary>Examination instructions</summary>
            <p style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 15 }}>
              {initial.instructions}
            </p>
          </details>
        </aside>
      </div>
      <Confirm
        open={confirm}
        title="Submit your examination?"
        message={`You have answered ${completed} of ${initial.questions.length} questions. ${initial.questions.length - completed > 0 ? `${initial.questions.length - completed} unanswered question(s) will receive no automatic credit. ` : ""}${Object.values(answers).filter((a) => a.flagged).length} question(s) are flagged. After submission, answers cannot be changed.`}
        confirmLabel="Submit final answers"
        onClose={() => setConfirm(false)}
        onConfirm={() => void submit()}
      />
    </main>
  );
}
