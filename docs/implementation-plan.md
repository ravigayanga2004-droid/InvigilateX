# Implementation plan

The repository initially contains only README.md. Build ExamGuard on Next.js App Router, strict TypeScript, React, PostgreSQL and Prisma. Retain the InvigilateX repository identity.

1. Foundation: reproducible tooling, normalized schema, migrations and local database.
2. Security: password hashing, database sessions, CSRF, roles, ownership, throttling and audit records.
3. Domain: courses, enrollment, banks/import, exam authoring and assignments.
4. Assessment: immutable question snapshots, deterministic order, transactional attempts, autosave, server deadlines and grading.
5. Experience: responsive role dashboards, light/dark themes, management, analytics and privacy-conscious integrity review.
6. Verification: unit, integration, browser and security tests; production build; deployment and operator documentation.

Use meaningful feature branches and 40–50 commits, merging completed tested phases into main. No fabricated contributors or backdated history. Only seed synthetic demo data. No paid services required. Password recovery defaults to an explicit local-only development delivery mechanism; production requires configured SMTP. Correct answers never appear in active student attempt payloads.

Security decisions and unmet requirements must be recorded in docs/final-verification.md. Browser activity is an explainable signal and cannot change academic scores.
