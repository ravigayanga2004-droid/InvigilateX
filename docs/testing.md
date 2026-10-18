# Verification

Use Node 24 and the committed lockfile. Install dependencies with `npm ci`, set local environment variables, start PostgreSQL, migrate, and seed the synthetic demonstration database.

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
npm audit --omit=dev
```

Unit tests cover password hashing, roles/ownership, CSRF origin checks, strict answer schemas, availability/attempt/deadline boundaries, stable question/option ordering, objective scoring, partial credit, decimal totals, analytics, and activity indicators. React Testing Library tests cover persistent themes and preventing stale network responses from replacing current resources.

Integration tests use real PostgreSQL and the production services. The suite requires a database whose name is exactly `examguard_test`, runs the committed migration, and clears only that dedicated test database. Set `TEST_DATABASE_URL` when the default loopback local database is unavailable. Never point tests at an important database. The local database helper creates both development and test databases.

Covered integration flows: course creation, atomic enrollment, invalid import rollback, bank/question creation, exam publishing, ownership rejection, concurrent starts, answer/seed isolation, option membership, monotonic save revisions, repeated submission, release visibility, attempt limits, persisted expiry reconciliation, manual grading/reopen audit, rate limits, role escalation, and one-time recovery/session invalidation.

Chromium tests use the synthetic seeded application database and intentionally create new test courses/exams/attempts. They exercise admin creation, instructor publishing, student save/refresh/submit, recorded visibility events, objective grading, instructor reporting, CSRF and role rejection, timer manipulation/late writes, duplicate submit, attempt limits, mobile navigation, and keyboard theme controls. They must only run against local or disposable environments. Browser traces and failure screenshots remain ignored under `test-results` and `playwright-report`.

For a production smoke test, build, prepare the standalone server, start it locally, and reuse that server while running Playwright. Modern browsers accept Secure cookies on localhost; deployments require HTTPS. E2E tests can alternatively start `npm run dev` automatically.

Manual review should include all role navigation, 390px and desktop layouts, both themes, focus visibility, native dialog keyboard behavior, actual connection interruption and retry, and institution-specific accommodations. Automated tests do not establish complete WCAG conformance or eliminate the need for an independent security review. Exact executed results and limitations are recorded in `docs/final-verification.md`.
