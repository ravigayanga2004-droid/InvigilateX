# Final verification

Verified locally on 19 October 2026 (Asia/Colombo) using Node 24, PostgreSQL 18, Next.js 16.4.2, Prisma 6.19.3, and Chromium. This report records observed results, not a guarantee that software has no defects.

## Implemented

- Full database-backed administrator, instructor, and student workflows; server-authenticated pages and protected APIs.
- Bcrypt passwords, hashed opaque HTTP-only sessions, same-origin mutation checks, database throttling/lockout, one-time recovery/verification, and revocation of sessions after account access or password changes.
- Courses and safe editing, atomic manual/CSV enrollment, selected-student assignments, bank creation, five question types, revised question copies, retirement, validated CSV/JSON preview/import, and inline authoring without losing the draft.
- Draft editing, weighted/reordered questions, preview, publish/unpublish checks, duplication, archive, availability windows, duration, attempt limits, randomization, resume, release, and integrity configuration.
- Frozen attempt snapshots, stable private-seed ordering, server deadlines, monotonically versioned autosave/retry, review flags, answer navigation/progress, confirmation, automatic reconciliation, and idempotent submission.
- Objective/partial-credit scoring, manual essay feedback, audited reopen, locked/released results, printed summaries, safe CSV export, paginated submission history, and scoped analytics.
- Explainable privacy-conscious activity timelines, event review, audit trail, notifications, profile/security settings, institutional settings, responsive navigation, persistent light/dark themes, accessible native controls/dialogs, and clear loading/empty/error states.
- SQL migrations, repeatable guarded synthetic seed, local PostgreSQL helper, Docker/Compose configuration, standalone production runtime, administrator provisioning, health/readiness endpoints, CI, and operator documentation.

## Executed checks

| Check                       | Observed result                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run format:check`      | Passed                                                                                                       |
| `npm run lint`              | Passed with no warnings                                                                                      |
| `npm run typecheck`         | Passed, strict TypeScript                                                                                    |
| `npm test`                  | 16 unit/UI tests passed                                                                                      |
| `npm run test:integration`  | 14 real PostgreSQL tests passed                                                                              |
| `npx playwright test`       | 4 complete Chromium workflows passed against the production standalone server                                |
| `npm run build`             | Passed, including standalone asset preparation                                                               |
| Clean database migration    | Passed on the dedicated integration database                                                                 |
| Synthetic seed              | Passed on development PostgreSQL; includes completed attempt, activity and audit data                        |
| Production dependency audit | `npm audit --omit=dev`: zero vulnerabilities                                                                 |
| Secret review               | No `.env`, runtime data, private keys, or credential tokens tracked; `.env.example` is intentionally tracked |
| Visual review               | Desktop light/dark and 390px mobile overview inspected; no page errors; mobile document width is 390px       |

Integration checks include concurrent starts, stale answer revisions, invalid import rollback, cross-student/instructor access rejection, answer/seed isolation, option membership, expired-write rejection after committed auto-submission, repeated submission, release visibility, grade reopening/audit, rate limits, role escalation, single-use reset/session revocation, concurrent last-administrator protection, and submission pagination isolation.

Browser workflows cover admin course creation and navigation, persistent themes, instructor inline objective/essay authoring, publication, student autosave/refresh, visibility-event capture, final submission, server objective grading, manual grading, result release, analytics/integrity views, CSRF/score injection rejection, client clock manipulation with server expiry enforcement, duplicate submit, attempt limits, and mobile keyboard navigation.

Production smoke checks verify HTTP-only/Secure/SameSite cookies, framing denial, nosniff, HSTS, absence of development eval permission, and successful liveness/readiness responses. Disposable captures are under ignored `artifacts/`.

The fresh Linux [GitHub Actions verification run](https://github.com/ravigayanga2004-droid/InvigilateX/actions/runs/39161951968) also passed every step for application commit `63a6ae5`, including installation from the lockfile, PostgreSQL container initialization, clean migrations, seed, all static/test checks, production audit, production build, and all browser workflows. Subsequent report and merge commits preserve that application source tree.

## Limits and deliberate alternatives

- External HTTPS hosting and real SMTP delivery were not provisioned or tested. Supply institution-owned infrastructure and credentials before a live rollout. Development recovery uses private ignored local files; production requires SMTP.
- Docker's engine was unavailable on this workstation. Docker/Compose files are provided; the application, migration, seed, and standalone runtime were verified with real local PostgreSQL. A container image build remains an operator check.
- The full npm audit reports five high-severity development-tool advisories through `eslint-config-next` → `fast-glob`/`micromatch`/`braces`. The registry offers no patched `braces` release for this chain. These tools are not part of the served application. Do not feed untrusted glob patterns to development tooling; update when upstream patches are available.
- CSP permits inline framework scripts/styles. A request-nonce strict CSP is recommended hardening. No user HTML or script execution is supported.
- Dashboard statistics and CSV snapshots use the most recent 200 attempts; question analysis uses at most 500 graded attempts; the overview lists at most 50 exams. Full submission history, examinations, people, and audit are paginated. Question selectors are bounded to 100 records per request; very large institutions need expanded bank pagination and full archival exports.
- Autosave retries pending answers in memory. A forced close before a confirmed save can lose unsaved edits. Use one active exam tab; simultaneous editing across tabs is not a supported collaboration mode. The server retains monotonic revisions and rejects late writes.
- Browser events can be blocked/spoofed and cannot be delivered while disconnected. Fullscreen is requested, not guaranteed on all devices. Activity never changes grades. Unattended automatic finalization requires the documented authenticated expiration schedule; reads/writes also reconcile deadlines.
- Severity weights are configurable in stored exam settings; the current author UI toggles logging and uses the documented default weights. There is no dedicated severity-weight editor.
- Native accessible controls/CSS replace shadcn. Management forms use native form handling plus mandatory server Zod validation; sign-in uses React Hook Form/Zod. Plain escaped text replaces rich HTML. Questions may be left unanswered with a submission warning. Reviewer roles, custom rubrics, image uploads/covers, and biometric invigilation are excluded optional features.
- Automated and visual checks are not a comprehensive WCAG certification, independent penetration test, load test, or backup-restore drill. Institutions must set retention and accommodations policies. No important pre-existing repository data was removed.

## Recommended follow-up

Before institutional rollout: verify SMTP and HTTPS, build the container in the target environment, schedule and monitor expiration jobs, provision real administrator accounts, restore-test encrypted backups, run an independent security/accessibility review, and measure representative exam concurrency. Add large-bank pagination/full exports, a severity editor, nonce CSP, and cross-tab conflict UX as the next product improvements.
