"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, GraduationCap, Users, CheckCheck } from "lucide-react";
import { Viewer } from "./shell";
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
type Course = {
  id: string;
  name: string;
  code: string;
  description: string;
  instructorId: string;
  instructor: { name: string };
  _count: { enrollments: number; exams: number };
};
export function Courses({ user }: { user: Viewer }) {
  const { data, error, loading, reload } = useResource<Course[]>("courses");
  const instructors = useResource<{ id: string; name: string }[]>(
    user.role === "ADMIN" ? "instructors" : "session",
  );
  const toast = useToast();
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [courseId, setCourseId] = useState("");
  const [emails, setEmails] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <div className="pagehead between" style={{ marginBottom: 0 }}>
        <div>
          <h1>
            {user.role === "STUDENT" ? "My courses" : "Courses & enrollment"}
          </h1>
          <p>A shared foundation for every assessment.</p>
        </div>
        {user.role === "ADMIN" && (
          <button
            className="btn primary"
            onClick={() => {
              setEditing(null);
              setCreate((v) => !v);
            }}
          >
            <Plus size={15} />
            {create ? "Close form" : "Create course"}
          </button>
        )}
      </div>
      {create && (
        <form
          key={editing?.id || "new-course"}
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            try {
              const fd = new FormData(form);
              await api(
                editing ? `courses/${editing.id}` : "courses",
                editing ? "PATCH" : "POST",
                Object.fromEntries(fd),
              );
              toast(editing ? "Course updated." : "Course created.");
              setCreate(false);
              void reload();
            } catch (e) {
              toast((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{editing ? "Edit course" : "New course"}</h2>
          <div className="grid2">
            <label className="field">
              Course name
              <input
                name="name"
                required
                minLength={3}
                defaultValue={editing?.name}
              />
            </label>
            <label className="field">
              Course code
              <input
                name="code"
                required
                minLength={2}
                defaultValue={editing?.code}
              />
            </label>
          </div>
          <label className="field">
            Instructor
            <select
              name="instructorId"
              required
              defaultValue={editing?.instructorId || ""}
            >
              <option value="">Select an instructor</option>
              {instructors.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Description
            <textarea name="description" defaultValue={editing?.description} />
          </label>
          <button disabled={busy} className="btn primary">
            {busy ? "Saving…" : editing ? "Save course" : "Create course"}
          </button>
        </form>
      )}
      {loading ? (
        <Loading />
      ) : error ? (
        <Failure message={error} retry={reload} />
      ) : data?.length ? (
        <div className="grid3">
          {data.map((c) => (
            <article className="card stack" key={c.id}>
              <div className="between">
                <span className="courseicon">
                  <GraduationCap size={21} />
                </span>
                <span className="badge">{c.code}</span>
              </div>
              <div>
                <h2>{c.name}</h2>
                <p className="muted" style={{ marginTop: 7, fontSize: 12 }}>
                  {c.description}
                </p>
              </div>
              <p className="muted" style={{ fontSize: 11 }}>
                Instructor · {c.instructor.name}
              </p>
              {user.role === "ADMIN" && (
                <button
                  className="btn small"
                  onClick={() => {
                    setEditing(c);
                    setCreate(true);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Edit course
                </button>
              )}
              <div className="between" style={{ fontSize: 11 }}>
                <span className="row">
                  <Users size={14} />
                  {c._count.enrollments} students
                </span>
                <span>{c._count.exams} exams</span>
              </div>
              {user.role !== "STUDENT" && (
                <button className="btn" onClick={() => setCourseId(c.id)}>
                  Manage enrollment
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="card">
          <Empty
            title="No courses yet"
            description="Your courses will appear here once they are created or assigned."
          />
        </section>
      )}
      {user.role !== "STUDENT" && (
        <section className="card stack">
          <h2>Enroll students</h2>
          <p className="muted">
            Enroll existing student accounts. Every email is validated before
            any enrollment is created.
          </p>
          <label className="field">
            Course
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">Select a course</option>
              {data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Student emails
            <textarea
              placeholder="student@example.test, another@example.test"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
          </label>
          <button
            className="btn primary"
            disabled={!courseId || !emails.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await api<{ count: number }>(
                  "enrollments",
                  "POST",
                  { courseId, emails: emails.split(/[\s,;]+/).filter(Boolean) },
                );
                toast(`${result.count} new enrollments created.`);
                setEmails("");
                void reload();
              } catch (e) {
                toast((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Enroll students
          </button>
          <hr className="divider" />
          <h3>Bulk enrollment from CSV</h3>
          <p className="muted" style={{ fontSize: 12 }}>
            Use a single column named <code>email</code>. Preview before
            confirming.
          </p>
          <label className="field">
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setCsv(await file.text());
                  setPreview(null);
                }
              }}
            />
          </label>
          <button
            className="btn"
            disabled={!courseId || !csv || busy}
            onClick={async () => {
              try {
                const result = await api<{ emails: string[] }>(
                  "enrollments/import",
                  "POST",
                  { courseId, content: csv },
                );
                setPreview(result.emails);
              } catch (e) {
                toast((e as Error).message, true);
              }
            }}
          >
            Preview enrollments
          </button>
          {preview && (
            <div className="stack">
              <div className="notice">
                {preview.length} emails: {preview.join(", ")}
              </div>
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("enrollments/import", "POST", {
                      courseId,
                      content: csv,
                      confirm: true,
                    });
                    toast("Bulk enrollment complete.");
                    setPreview(null);
                    setCsv("");
                    void reload();
                  } catch (e) {
                    toast((e as Error).message, true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm all enrollments
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
};
export function People({ user }: { user: Viewer }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useResource<Person[]>(
    `people?page=${page}&q=${encodeURIComponent(query)}`,
  );
  const toast = useToast();
  const [create, setCreate] = useState(false);
  const [change, setChange] = useState<{
    person: Person;
    data: Record<string, string>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <div className="pagehead between" style={{ marginBottom: 0 }}>
        <div>
          <h1>People</h1>
          <p>Manage access with clarity and care.</p>
        </div>
        <button className="btn primary" onClick={() => setCreate((v) => !v)}>
          <Plus size={15} />
          Add person
        </button>
      </div>
      {create && (
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(
                "people",
                "POST",
                Object.fromEntries(new FormData(e.currentTarget)),
              );
              toast(
                "Account created. Share the initial password through a secure channel.",
              );
              setCreate(false);
              void reload();
            } catch (e) {
              toast((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Create account</h2>
          <div className="grid2">
            <label className="field">
              Name
              <input name="name" required minLength={2} />
            </label>
            <label className="field">
              Email
              <input name="email" type="email" required />
            </label>
            <label className="field">
              Role
              <select name="role">
                <option>STUDENT</option>
                <option>INSTRUCTOR</option>
                <option>ADMIN</option>
              </select>
            </label>
            <label className="field">
              Initial password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={72}
              />
            </label>
          </div>
          <button className="btn primary" disabled={busy}>
            Create account
          </button>
        </form>
      )}
      <section className="card">
        <label className="field" style={{ maxWidth: 400, marginBottom: 20 }}>
          Search people
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Name or email…"
          />
        </label>
        {loading ? (
          <Loading />
        ) : error ? (
          <Failure message={error} retry={reload} />
        ) : !data?.length ? (
          <Empty
            title="No people found"
            description="Try a different search or create an account."
          />
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <details style={{ marginTop: 6 }}>
                        <summary
                          style={{
                            fontSize: 10,
                            cursor: "pointer",
                            color: "var(--accent)",
                          }}
                        >
                          Edit name
                        </summary>
                        <form
                          className="row"
                          style={{ marginTop: 8 }}
                          onSubmit={async (event) => {
                            event.preventDefault();
                            try {
                              const fd = new FormData(event.currentTarget);
                              await api(`people/${p.id}`, "PATCH", {
                                name: fd.get("name"),
                              });
                              toast(
                                "Name updated. Existing sessions were ended.",
                              );
                              void reload();
                            } catch (error) {
                              toast((error as Error).message, true);
                            }
                          }}
                        >
                          <label className="sr-only" htmlFor={`name-${p.id}`}>
                            Name for {p.name}
                          </label>
                          <input
                            className="input"
                            id={`name-${p.id}`}
                            name="name"
                            required
                            minLength={2}
                            defaultValue={p.name}
                          />
                          <button className="btn small">Save</button>
                        </form>
                      </details>
                      <small style={{ display: "block" }}>{p.email}</small>
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`role-${p.id}`}>
                        Role for {p.name}
                      </label>
                      <select
                        id={`role-${p.id}`}
                        className="input"
                        disabled={p.id === user.id}
                        value={p.role}
                        onChange={(e) =>
                          setChange({
                            person: p,
                            data: { role: e.target.value },
                          })
                        }
                      >
                        <option>STUDENT</option>
                        <option>INSTRUCTOR</option>
                        <option>ADMIN</option>
                      </select>
                    </td>
                    <td>
                      <Badge status={p.status} />
                    </td>
                    <td>{date(p.lastLoginAt)}</td>
                    <td>
                      <div className="row">
                        <button
                          className="btn small"
                          disabled={p.id === user.id}
                          onClick={() =>
                            setChange({
                              person: p,
                              data: {
                                status:
                                  p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                              },
                            })
                          }
                        >
                          {p.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                        </button>
                        <button
                          className="btn small"
                          disabled={p.id === user.id}
                          onClick={() =>
                            setChange({
                              person: p,
                              data: {
                                status:
                                  p.status === "LOCKED" ? "ACTIVE" : "LOCKED",
                              },
                            })
                          }
                        >
                          {p.status === "LOCKED" ? "Unlock" : "Lock"}
                        </button>
                        <button
                          className="btn small"
                          onClick={async () => {
                            try {
                              await api("auth/forgot-password", "POST", {
                                email: p.email,
                              });
                              toast(
                                "Recovery requested. The user can follow the emailed one-time link.",
                              );
                            } catch (e) {
                              toast((e as Error).message, true);
                            }
                          }}
                        >
                          Send reset
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div
          className="row"
          style={{ justifyContent: "flex-end", marginTop: 20 }}
        >
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
      <Confirm
        open={!!change}
        title="Update account access?"
        message={`This changes access for ${change?.person.name || "this person"} and ends their active sessions. This action is audited.`}
        onClose={() => setChange(null)}
        onConfirm={async () => {
          if (!change) return;
          try {
            await api(`people/${change.person.id}`, "PATCH", change.data);
            toast("Account updated.");
            void reload();
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      />
    </div>
  );
}
export function Profile({ user }: { user: Viewer }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="pagehead">
        <h1>Profile & security</h1>
        <p>Keep your details and account protection up to date.</p>
      </div>
      <form
        className="card stack"
        style={{ maxWidth: 700 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const form = e.currentTarget;
            const fd = new FormData(form);
            const result = await api<{ message: string }>("profile", "PATCH", {
              name: fd.get("name"),
              ...(fd.get("newPassword")
                ? {
                    currentPassword: fd.get("currentPassword"),
                    newPassword: fd.get("newPassword"),
                  }
                : {}),
            });
            toast(result.message);
            if (fd.get("newPassword")) router.push("/login");
          } catch (e) {
            toast((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="row">
          <span className="avatar">{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <p className="muted" style={{ fontSize: 12 }}>
              {user.email}
            </p>
          </div>
          <Badge status={user.role} />
        </div>
        <label className="field">
          Display name
          <input name="name" required minLength={2} defaultValue={user.name} />
        </label>
        <hr className="divider" />
        <h2>Change password</h2>
        <p className="muted">
          Updating your password signs out all devices. Leave these fields blank
          to keep your current password.
        </p>
        <label className="field">
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
        </label>
        <label className="field">
          New password
          <input
            name="newPassword"
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
        </label>
        <button className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </>
  );
}
type Notification = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
export function Notifications() {
  const { data, error, loading, reload } =
    useResource<Notification[]>("notifications");
  const toast = useToast();
  return (
    <>
      <div className="pagehead between">
        <div>
          <h1>Notifications</h1>
          <p>Your latest assessment updates.</p>
        </div>
        <button
          className="btn"
          onClick={async () => {
            try {
              await api("notifications/read", "POST", {});
              void reload();
              toast("All notifications marked as read.");
            } catch (e) {
              toast((e as Error).message, true);
            }
          }}
        >
          <CheckCheck size={15} />
          Mark all read
        </button>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <Failure message={error} retry={reload} />
      ) : (
        <div className="card">
          {data?.length ? (
            data.map((n) => (
              <article className="activity-item" key={n.id}>
                <span className="activity-dot">
                  <CheckCheck size={14} />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="between">
                    <strong>{n.title}</strong>
                    {!n.readAt && <span className="badge green">NEW</span>}
                  </div>
                  <p>{n.message}</p>
                  <small>
                    {date(n.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <Empty
              title="You’re all caught up"
              description="Notifications about your exams and results will appear here."
            />
          )}
        </div>
      )}
    </>
  );
}
export function Settings() {
  const { data, error, loading, reload } =
    useResource<{ key: string; value: string }[]>("settings");
  const toast = useToast();
  if (loading) return <Loading />;
  if (error) return <Failure message={error} retry={reload} />;
  const value = (key: string) => data?.find((s) => s.key === key)?.value || "";
  return (
    <>
      <div className="pagehead">
        <h1>Platform settings</h1>
        <p>Institution details and transparent assessment guidance.</p>
      </div>
      <form
        className="card stack"
        style={{ maxWidth: 750 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(
              "settings",
              "PATCH",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            toast("Platform settings saved.");
            void reload();
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      >
        <label className="field">
          Institution name
          <input
            name="institutionName"
            required
            minLength={2}
            defaultValue={value("institutionName") || "ExamGuard Academy"}
          />
        </label>
        <label className="field">
          Support email
          <input
            name="supportEmail"
            type="email"
            required
            defaultValue={value("supportEmail") || "support@example.test"}
          />
        </label>
        <label className="field">
          Institution integrity guidance
          <textarea
            name="integrityNotice"
            defaultValue={
              value("integrityNotice") ||
              "Browser activity is an indicator for human review and never determines a grade."
            }
          />
        </label>
        <button className="btn primary">Save settings</button>
        <div className="notice">
          Session cookies are HTTP-only. Passwords use bcrypt cost 12.
          Registration, trusted proxy headers, SMTP, and secrets are configured
          by the deployment environment. Changes to account access end existing
          sessions.
        </div>
      </form>
    </>
  );
}
