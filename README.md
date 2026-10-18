# InvigilateX · ExamGuard

A privacy-conscious online examination platform for educators, students, and administrators. Built with Next.js App Router, strict TypeScript, React, Tailwind CSS, PostgreSQL, Prisma, Zod, React Hook Form, and Recharts.

## What works

- Separate administrator, instructor, and student workspaces with responsive navigation and persistent light/dark themes.
- Secure email/password sessions, role/ownership checks, throttling, lockouts, and one-time account recovery.
- Courses, manual and CSV enrollment, question banks, five question types, atomic CSV/JSON question imports, draft authoring, question ordering, publishing, duplication, archiving, and selected-student assignments.
- Server-timed, randomized frozen attempts; autosave with retry status; resume, review flags, progress, final confirmation, and idempotent submission.
- Server-side objective/partial-credit scoring, manual essay feedback, audited grade reopening, result release, printable summaries, and CSV reports.
- Analytics, transparent browser-activity timelines, review records, notifications, and audit logs.

## Local setup

Requires Node 24, npm, Git, and PostgreSQL. Docker Compose is provided; a local PostgreSQL helper is included when Docker is unavailable. On Windows use `npm.cmd` / `npx.cmd` if PowerShell blocks `.ps1` shims.

```sh
npm ci
cp .env.example .env
# Replace both placeholder secrets with unique random values.
docker compose up -d db
# Alternative in a separate terminal: npm run db:local
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. In PowerShell use `Copy-Item .env.example .env`. Generate each secret with `node -e "console.log(require('crypto').randomBytes(40).toString('hex'))"`; put the output in the ignored `.env`, never in source control.

The seed requires `SEED_DEMO=true` and refuses production. It is repeatable without resetting existing demo passwords or overwriting authored records.

| Demo role     | Email                     | Password               |
| ------------- | ------------------------- | ---------------------- |
| Administrator | `admin@example.test`      | `Demo-ExamGuard-2026!` |
| Instructor    | `instructor@example.test` | `Demo-ExamGuard-2026!` |
| Student       | `student@example.test`    | `Demo-ExamGuard-2026!` |

These are synthetic, development-only identities. Never deploy demo accounts to production. The first seeded exam has a released completed attempt; the student can use one further attempt. The second exam is a draft with an essay for exploring authoring and manual grading.

## Configuration

| Variable                | Meaning                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection URL                                                     |
| `APP_URL`               | Canonical origin, exact match for mutation-origin checks; HTTPS in production |
| `SESSION_SECRET`        | Random 32+ character secret for privacy-safe network identifiers              |
| `CRON_SECRET`           | Independent random 32+ character expiration-job bearer secret                 |
| `ALLOW_REGISTRATION`    | Defaults false; enabling creates student accounts only                        |
| `SEED_DEMO`             | Explicit local demo seed opt-in                                               |
| `SMTP_URL`, `MAIL_FROM` | Production recovery/verification delivery                                     |
| `TRUST_PROXY`           | Optional false-by-default forwarding-header trust                             |
| `TEST_DATABASE_URL`     | Optional dedicated `examguard_test` integration database                      |

Without SMTP, development recovery links are written to ignored `.local/mail`. They are never returned by the API or printed in logs. Production recovery requires SMTP. Self-registration with SMTP requires email verification; institution-provisioned accounts are verified by their administrator.

## Commands

| Command                                   | Purpose                                                              |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                             | Local development                                                    |
| `npm run build` / `npm start`             | Production build / serving                                           |
| `npm run lint` / `npm run typecheck`      | Static checks                                                        |
| `npm run format` / `npm run format:check` | Formatting                                                           |
| `npm test` / `npm run test:watch`         | Unit and UI tests                                                    |
| `npm run test:integration`                | Dedicated real-PostgreSQL suite                                      |
| `npm run test:e2e`                        | Chromium workflows; install browser first                            |
| `npm run db:migrate` / `npm run db:seed`  | Apply migrations / opt-in synthetic seed                             |
| `npm run db:local`                        | Persistent loopback PostgreSQL alternative                           |
| `npm run db:reset`                        | Destructive developer-only Prisma reset; never run on important data |

## Production and security

Use HTTPS, private PostgreSQL, unique secrets, SMTP, monitored backups, and an authenticated scheduled call to `/api/cron/expire` every minute. The Dockerfile builds a non-root runtime. Run migrations separately before switching traffic. Provision a real first administrator using `scripts/create-admin.ts` with identity environment variables and a password passed through stdin.

Correct answers and the private shuffle seed are excluded from active student payloads. Scores, deadlines, eligibility, and limits are enforced on the server. Browser events are imperfect review signals and never alter grades. No camera, microphone, biometric, or clipboard-content collection is included.

See [architecture](docs/architecture.md), [database](docs/database-schema.md), [API](docs/api.md), [security](docs/security.md), [activity policy](docs/anti-cheating-policy.md), [testing](docs/testing.md), [deployment](docs/deployment.md), and [final verification](docs/final-verification.md).

## Screenshots

To capture your institution's workspace, seed locally, sign in, choose light or dark mode, and capture the Overview, Question banks, and exam room at desktop and 390px widths. Use synthetic accounts and hide personal information. Keep disposable QA captures under ignored `artifacts/`; selected documentation screenshots may be added under `docs/screenshots/`.
