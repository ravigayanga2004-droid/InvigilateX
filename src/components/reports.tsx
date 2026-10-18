"use client";
import Link from "next/link";
import { useState } from "react";
import { BarChart3, Target, Clock3, ShieldCheck } from "lucide-react";
import { Viewer } from "./shell";
import { DashboardData, AttemptData } from "@/lib/types";
import {
  api,
  useResource,
  useToast,
  Loading,
  Failure,
  Empty,
  Badge,
  Confirm,
  date,
} from "./ui";
import { AttemptTable } from "./exams";
export function Analytics({ user }: { user: Viewer }) {
  const { data, error, loading, reload } =
    useResource<DashboardData>("dashboard");
  if (loading) return <Loading />;
  if (error || !data) return <Failure message={error} retry={reload} />;
  const stats = [
    {
      label: "Average score",
      value: `${data.stats.average.toFixed(1)}%`,
      Icon: BarChart3,
    },
    {
      label: "Median score",
      value: `${data.stats.median.toFixed(1)}%`,
      Icon: Target,
    },
    {
      label: "Pass rate",
      value: `${data.passRate.toFixed(1)}%`,
      Icon: ShieldCheck,
    },
    {
      label: "Completion rate",
      value: `${data.completionRate.toFixed(1)}%`,
      Icon: Clock3,
    },
  ];
  const completed = data.attempts.filter((a) => a.submittedAt);
  const avg = completed.length
    ? completed.reduce(
        (sum, a) =>
          sum +
          (new Date(a.submittedAt!).getTime() -
            new Date(a.startedAt).getTime()) /
            60000,
        0,
      ) / completed.length
    : 0;
  return (
    <div className="stack">
      <div className="pagehead between" style={{ marginBottom: 0 }}>
        <div>
          <h1>Performance analytics</h1>
          <p>Understand the story behind every assessment.</p>
        </div>
        {user.role !== "STUDENT" && (
          <a className="btn" href="/api/export" download>
            Export results CSV
          </a>
        )}
      </div>
      <section className="grid4">
        {stats.map(({ label, value, Icon }) => (
          <article key={label} className="card stat">
            <div className="stat-icon">
              <Icon size={20} />
            </div>
            <p className="stat-label">{label}</p>
            <div className="stat-value">{value}</div>
            <small>Within your authorized workspace</small>
          </article>
        ))}
      </section>
      <div className="grid2">
        <section className="card stack">
          <h2>Score distribution</h2>
          {data.stats.distribution.map((b) => (
            <div key={b.label}>
              <div className="between">
                <span>{b.label}%</span>
                <strong>{b.count} results</strong>
              </div>
              <div className="progress" style={{ height: 12 }}>
                <span
                  style={{
                    width: `${data.stats.count ? (b.count / data.stats.count) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
          {!data.stats.count && (
            <p className="muted">
              No graded {user.role === "STUDENT" ? "released " : ""}results yet.
            </p>
          )}
        </section>
        <section className="card stack">
          <h2>Assessment outcomes</h2>
          <div className="between">
            <span className="muted">Highest score</span>
            <strong>{data.stats.highest.toFixed(1)}%</strong>
          </div>
          <div className="between">
            <span className="muted">Lowest score</span>
            <strong>{data.stats.lowest.toFixed(1)}%</strong>
          </div>
          <div className="between">
            <span className="muted">Average time taken</span>
            <strong>{avg.toFixed(1)} minutes</strong>
          </div>
          <div className="between">
            <span className="muted">Completed attempts</span>
            <strong>{completed.length}</strong>
          </div>
          <div className="notice">
            Scores reflect graded results
            {user.role === "STUDENT" ? " released to you" : ""}. This dashboard
            shows the most recent 200 attempts. Activity indicators are reviewed
            separately from academic performance.
          </div>
        </section>
      </div>
      <section className="card">
        <h2>Per-student performance</h2>
        <AttemptTable attempts={data.attempts} />
      </section>
      {user.role !== "STUDENT" && <QuestionInsights />}
    </div>
  );
}
function QuestionInsights() {
  const { data, error, loading, reload } = useResource<{
    questions: {
      id: string;
      text: string;
      exam: string;
      responses: number;
      facility: number;
      missed: number;
      discrimination: number | null;
    }[];
    courses: { name: string; code: string; students: number; exams: number }[];
    sampleSize: number;
  }>("insights");
  if (loading) return <Loading />;
  if (error || !data) return <Failure message={error} retry={reload} />;
  return (
    <>
      <section className="card stack">
        <h2>Question analysis</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          Most-missed questions first, from the latest {data.sampleSize} graded
          attempts (up to 500). Facility is average earned credit.
          Discrimination compares the top and bottom 27% within an exam and
          requires at least 10 responses.
        </p>
        {data.questions.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Responses</th>
                  <th>Facility</th>
                  <th>Not full credit</th>
                  <th>Discrimination</th>
                </tr>
              </thead>
              <tbody>
                {data.questions.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <strong>{q.text}</strong>
                      <small style={{ display: "block" }}>{q.exam}</small>
                    </td>
                    <td>{q.responses}</td>
                    <td>{q.facility}%</td>
                    <td>{q.missed}</td>
                    <td>{q.discrimination ?? "Insufficient data"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Question insights will appear after grading" />
        )}
      </section>
      <section className="card stack">
        <h2>Usage by course</h2>
        {data.courses.map((c) => (
          <div className="between" key={c.code}>
            <div>
              <strong>{c.name}</strong>
              <p className="muted" style={{ fontSize: 11 }}>
                {c.code}
              </p>
            </div>
            <span>
              {c.students} students · {c.exams} exams
            </span>
          </div>
        ))}
        {!data.courses.length && <Empty title="No courses yet" />}
      </section>
    </>
  );
}
type IntegrityEntry = {
  id: string;
  title: string;
  student: string;
  status: string;
  summary: { score: number; label: string; notice: string };
  events: {
    id: string;
    eventType: string;
    severity: number;
    occurredAt: string;
    reviewedAt: string | null;
  }[];
};
export function Integrity() {
  const { data, error, loading, reload } =
    useResource<IntegrityEntry[]>("integrity");
  const toast = useToast();
  const [expanded, setExpanded] = useState("");
  return (
    <div className="stack">
      <div className="pagehead" style={{ marginBottom: 0 }}>
        <h1>Exam integrity</h1>
        <p>Context first. People always.</p>
      </div>
      <div className="notice">
        Browser activity is an indicator, not proof of misconduct. Events never
        change academic scores. Consider accessibility tools, connection
        interruptions, and each student’s explanation.
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <Failure message={error} retry={reload} />
      ) : !data?.length ? (
        <section className="card">
          <Empty
            title="No activity to review"
            description="Attempt timelines appear when students start examinations."
          />
        </section>
      ) : (
        data.map((a) => (
          <section className="card stack" key={a.id}>
            <div className="between wrap">
              <div>
                <h2>{a.student}</h2>
                <p className="muted" style={{ fontSize: 12, marginTop: 5 }}>
                  {a.title}
                </p>
              </div>
              <div className="row">
                <span className="badge amber">
                  {a.summary.label} · {a.summary.score}
                </span>
                <button
                  className="btn small"
                  onClick={() => setExpanded(expanded === a.id ? "" : a.id)}
                >
                  {expanded === a.id ? "Hide timeline" : "Review timeline"}
                </button>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 11 }}>
              {a.events.length} events · Score is the sum of configured event
              severity values. It is independent of the academic result.
            </p>
            {expanded === a.id && (
              <>
                <Link
                  className="btn small"
                  style={{ alignSelf: "start" }}
                  href={`/dashboard/attempts/${a.id}`}
                >
                  Open submission
                </Link>
                {a.events.length ? (
                  a.events.map((event) => (
                    <div className="activity-item" key={event.id}>
                      <span className="activity-dot">
                        <ShieldCheck size={13} />
                      </span>
                      <div style={{ flex: 1 }}>
                        <strong>{event.eventType.replaceAll("_", " ")}</strong>
                        <small>
                          {date(event.occurredAt, {
                            dateStyle: "medium",
                            timeStyle: "medium",
                          })}{" "}
                          · Severity {event.severity}
                        </small>
                      </div>
                      {event.reviewedAt ? (
                        <Badge status="REVIEWED" />
                      ) : (
                        <button
                          className="btn small"
                          onClick={async () => {
                            try {
                              await api("integrity/review", "POST", {
                                eventId: event.id,
                              });
                              void reload();
                              toast("Event marked as reviewed.");
                            } catch (e) {
                              toast((e as Error).message, true);
                            }
                          }}
                        >
                          Mark reviewed
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty title="No browser events recorded" />
                )}
              </>
            )}
          </section>
        ))
      )}
    </div>
  );
}
export function Audit() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useResource<
    {
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      createdAt: string;
      actor: { name: string } | null;
      metadata: Record<string, unknown>;
    }[]
  >(`audit?page=${page}&q=${encodeURIComponent(query)}`);
  return (
    <>
      <div className="pagehead">
        <h1>Audit trail</h1>
        <p>A traceable record of important workspace changes.</p>
      </div>
      <section className="card stack">
        <label className="field" style={{ maxWidth: 400 }}>
          Filter by action
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. GRADE, LOGIN, EXAM"
          />
        </label>
        {loading ? (
          <Loading />
        ) : error ? (
          <Failure message={error} retry={reload} />
        ) : !data?.length ? (
          <Empty title="No matching audit events" />
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Resource</th>
                  <th>Time</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <Badge status={log.action} />
                    </td>
                    <td>{log.actor?.name || "System / unknown"}</td>
                    <td>
                      {log.entityType}
                      <small style={{ display: "block" }}>{log.entityId}</small>
                    </td>
                    <td>
                      {date(log.createdAt, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      <code>{JSON.stringify(log.metadata)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button
            className="btn small"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            className="btn small"
            disabled={(data?.length || 0) < 25}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </>
  );
}
export function AttemptReview({ id, user }: { id: string; user: Viewer }) {
  const {
    data: a,
    error,
    loading,
    reload,
  } = useResource<AttemptData>(`attempts/${id}`);
  const toast = useToast();
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  if (loading) return <Loading />;
  if (error || !a) return <Failure message={error} retry={reload} />;
  const staff = user.role !== "STUDENT";
  return (
    <div className="stack">
      <div className="pagehead between" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 9 }}>
            ATTEMPT REVIEW
          </div>
          <h1>{a.title}</h1>
          <p>
            Submitted{" "}
            {date(a.submittedAt, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <Badge status={a.status} />
      </div>
      {a.status === "IN_PROGRESS" ? (
        <section className="card stack">
          <h2>This attempt is in progress</h2>
          <p className="muted">
            The student can continue until the server deadline.
          </p>
          {!staff && (
            <Link className="btn primary" href={`/exam/${id}`}>
              Resume attempt
            </Link>
          )}
        </section>
      ) : (
        <>
          <section className="card between wrap">
            <div>
              <span className="eyebrow">
                {a.released
                  ? "RELEASED RESULT"
                  : staff
                    ? "CURRENT SCORE"
                    : "RESULT STATUS"}
              </span>
              {a.percentage !== null ? (
                <>
                  <div className="result-score">
                    {Number(a.percentage).toFixed(1)}
                    <span style={{ fontSize: 25 }}>%</span>
                  </div>
                  <Badge status={a.passed ? "PASSED" : "BELOW PASSING SCORE"} />
                  <p className="muted" style={{ marginTop: 8 }}>
                    {a.score} /{" "}
                    {a.questions.reduce((s, q) => s + Number(q.points), 0)}{" "}
                    points
                  </p>
                </>
              ) : (
                <h2 style={{ marginTop: 15 }}>Awaiting grading or release</h2>
              )}
            </div>
            <div className="stack">
              <p className="muted">
                {Math.max(
                  0,
                  Math.round(
                    (new Date(a.submittedAt || a.expiresAt).getTime() -
                      new Date(a.startedAt).getTime()) /
                      60000,
                  ),
                )}{" "}
                minutes taken
              </p>
              {staff ? (
                <div className="row">
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => setAction("reopen")}
                  >
                    Reopen grading
                  </button>
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => setAction("release")}
                  >
                    Finalize & release
                  </button>
                </div>
              ) : (
                a.released && (
                  <button className="btn" onClick={() => window.print()}>
                    Print result summary
                  </button>
                )
              )}
            </div>
          </section>
          {!a.released && !staff && (
            <div className="notice">
              Your answers are safely submitted. Your instructor will release
              your result after review.
            </div>
          )}
          {(staff || a.released) &&
            a.questions.map((q, i) => (
              <section className="card stack" key={q.id}>
                <div className="between">
                  <span className="eyebrow">
                    QUESTION {i + 1} · {q.type.replaceAll("_", " ")}
                  </span>
                  <span className="badge">
                    {q.answer?.grade?.points ?? "Pending"} / {q.points}
                  </span>
                </div>
                <h2>{q.text}</h2>
                {q.options.map((o) => (
                  <div key={o.id} className="row" style={{ fontSize: 13 }}>
                    <span>
                      {q.answer?.optionIds.includes(o.id) ? "◉" : "○"}
                    </span>
                    {o.text}
                    {q.correctOptionIds?.includes(o.id) && (
                      <span className="badge green">CORRECT</span>
                    )}
                  </div>
                ))}
                {["SHORT_ANSWER", "ESSAY"].includes(q.type) && (
                  <div
                    style={{
                      background: "var(--surface2)",
                      padding: 17,
                      borderRadius: 8,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {q.answer?.text || "No answer provided."}
                  </div>
                )}
                {q.correctText && (
                  <p className="muted">Reference answer: {q.correctText}</p>
                )}
                {q.explanation && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    {q.explanation}
                  </p>
                )}
                {q.answer?.grade?.feedback && (
                  <div className="notice">
                    Feedback: {q.answer.grade.feedback}
                  </div>
                )}
                {staff && q.type === "ESSAY" && (
                  <form
                    className="stack"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        const fd = new FormData(e.currentTarget);
                        await api(`attempts/${id}/grade`, "POST", {
                          action: "grade",
                          answerId: q.answer?.id,
                          points: Number(fd.get("points")),
                          feedback: fd.get("feedback"),
                        });
                        toast("Grade saved.");
                        void reload();
                      } catch (e) {
                        toast((e as Error).message, true);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label className="field">
                      Awarded points
                      <input
                        name="points"
                        type="number"
                        min={0}
                        max={Number(q.points)}
                        step={0.01}
                        required
                        defaultValue={q.answer?.grade?.points || 0}
                      />
                    </label>
                    <label className="field">
                      Instructor feedback
                      <textarea
                        name="feedback"
                        defaultValue={q.answer?.grade?.feedback}
                      />
                    </label>
                    <button className="btn primary" disabled={busy}>
                      Save essay grade
                    </button>
                  </form>
                )}
              </section>
            ))}
        </>
      )}
      <Confirm
        open={!!action}
        title={
          action === "release"
            ? "Finalize and release this result?"
            : "Reopen grading?"
        }
        message={
          action === "release"
            ? "All questions must be graded. The result becomes visible to the student and is locked against changes."
            : "The result will be hidden from the student while grading is reopened. This action and subsequent score changes are audited."
        }
        onClose={() => setAction("")}
        onConfirm={async () => {
          setBusy(true);
          try {
            const result = await api<{ message: string }>(
              `attempts/${id}/grade`,
              "POST",
              { action },
            );
            toast(result.message);
            void reload();
          } catch (e) {
            toast((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
