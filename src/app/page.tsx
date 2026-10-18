import Link from "next/link";
import {
  ShieldCheck,
  ArrowRight,
  BookOpenCheck,
  Fingerprint,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui";
export default function Landing() {
  return (
    <main className="landing" id="main-content">
      <header className="between">
        <Link href="/" className="brand">
          <span className="brandmark">
            <ShieldCheck size={24} />
          </span>
          ExamGuard
        </Link>
        <div className="row">
          <ThemeToggle />
          <Link href="/login" className="btn">
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      </header>
      <section className="landinghero">
        <span className="badge green">
          <CheckCircle2 size={12} /> BUILT FOR CONFIDENT ASSESSMENT
        </span>
        <h1>
          Great assessments.
          <br />
          <span style={{ color: "var(--accent)" }}>Clearer possibilities.</span>
        </h1>
        <p>
          Create thoughtful exams, give students a focused space to succeed, and
          turn every result into a useful insight.
        </p>
        <div className="row">
          <Link href="/login" className="btn primary">
            Open your workspace <ArrowRight size={16} />
          </Link>
          <Link href="/privacy" className="btn">
            Our privacy promise
          </Link>
        </div>
        <p style={{ fontSize: 12 }}>Secure by design. Thoughtful by nature.</p>
      </section>
      <section className="grid3">
        {[
          {
            Icon: BookOpenCheck,
            title: "Teach. Assess. Improve.",
            text: "Question banks, flexible exam settings, and a clear workflow from draft to released results.",
          },
          {
            Icon: Fingerprint,
            title: "Integrity with perspective",
            text: "Transparent browser activity signals help educators review fairly. No cameras, microphones, or biometric tracking.",
          },
          {
            Icon: BarChart3,
            title: "Insights that make sense",
            text: "Understand performance, give meaningful feedback, and help every student see their next step.",
          },
        ].map(({ Icon, title, text }) => (
          <article className="card stack" key={title}>
            <Icon size={27} color="var(--accent)" />
            <h2>{title}</h2>
            <p className="muted">{text}</p>
          </article>
        ))}
      </section>
      <footer className="footer" style={{ marginTop: 60 }}>
        <span>
          © {new Date().getFullYear()} ExamGuard. A better space for assessment.
        </span>
        <div className="row">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </main>
  );
}
