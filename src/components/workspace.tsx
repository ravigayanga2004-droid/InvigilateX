"use client";
import Link from "next/link";
import { Viewer } from "./shell";
import { Overview } from "./overview";
import { Exams, ExamBuilder, ExamDetail, Submissions } from "./exams";
import { Banks } from "./banks";
import {
  Courses,
  People,
  Profile,
  Notifications,
  Settings,
} from "./management";
import { Analytics, Integrity, Audit, AttemptReview } from "./reports";
export function Workspace({
  user,
  section,
}: {
  user: Viewer;
  section: string[];
}) {
  const [page, id, action] = section;
  const staff = user.role !== "STUDENT";
  const denied = (
    <div className="card stack">
      <h1>Access restricted</h1>
      <p>Your account does not have permission to view this page.</p>
      <Link className="btn" href="/dashboard">
        Return to overview
      </Link>
    </div>
  );
  if (!page) return <Overview user={user} />;
  if (page === "exams") {
    if (id === "new") return staff ? <ExamBuilder /> : denied;
    if (id && action === "edit")
      return staff ? <ExamBuilder id={id} /> : denied;
    if (id && action === "preview")
      return staff ? <ExamDetail id={id} user={user} preview /> : denied;
    if (id) return <ExamDetail id={id} user={user} />;
    return <Exams user={user} />;
  }
  if (page === "banks") return staff ? <Banks /> : denied;
  if (page === "courses") return <Courses user={user} />;
  if (page === "users")
    return user.role === "ADMIN" ? <People user={user} /> : denied;
  if (page === "submissions") return <Submissions user={user} />;
  if (page === "attempts" && id) return <AttemptReview id={id} user={user} />;
  if (page === "analytics") return <Analytics user={user} />;
  if (page === "integrity") return staff ? <Integrity /> : denied;
  if (page === "audit") return user.role === "ADMIN" ? <Audit /> : denied;
  if (page === "settings") return user.role === "ADMIN" ? <Settings /> : denied;
  if (page === "profile") return <Profile user={user} />;
  if (page === "notifications") return <Notifications />;
  return (
    <div className="card stack">
      <h1>Page not found</h1>
      <p>Choose a workspace page from the navigation.</p>
      <Link className="btn" href="/dashboard">
        Return to overview
      </Link>
    </div>
  );
}
