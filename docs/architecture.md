# Architecture

ExamGuard is a Next.js App Router application with React client views and a Node.js server. PostgreSQL is the source of truth; Prisma 6 generates the typed client. Version 6 is retained deliberately for its mature PostgreSQL transaction API. Node 24 is the development and container runtime.

## Boundaries

- `src/app`: routing, page authentication, safe error boundaries, and a centralized HTTP adapter.
- `src/components`: role-specific workspace, exam authoring, exam runner, management, and reporting.
- `src/lib`: pure assessment rules, strict Zod contracts, authentication, authorization, safe errors, environment validation, and audit helpers.
- `src/server`: application operations for accounts, catalog, management, attempts, and reporting. Business rules run here, never in the browser.
- `prisma`: normalized schema, SQL migration, and explicitly opted-in synthetic seed.
- `tests`: pure/security/UI unit tests, real PostgreSQL integration tests, and Chromium workflows.

## Request lifecycle

Mutations require the configured same-origin `Origin` header, a valid database session, role checks, resource ownership, strict input validation, and rate limits. Public authentication routes have their own limits. Unexpected errors return a correlation ID and a generic message. Prisma uniqueness conflicts return 409.

## Attempt lifecycle

1. Lock the exam row in a transaction. Check assignment, publication, window, resume policy, and attempt count.
2. Generate a private random seed. Freeze question content, points, reference answers, and option order into attempt questions. Never serialize the seed to a student.
3. Save monotonically versioned answers under an attempt row lock. Validate question membership and option IDs. A stale retry cannot replace a newer revision.
4. Compare the server time with the deadline on every save and submission. If a save is late, commit auto-submission before returning 409.
5. Grade objective responses in integer cents, leave essays pending, and create one result under the same lock. Repeated submission returns the existing outcome.
6. Release results only when all answers have grades. Finalized manual changes require an audited reopen, which hides the result until released again.

The browser displays a monotonic countdown anchored to server time. The browser clock is informational; PostgreSQL-backed operations enforce the actual deadline. A scheduled authenticated expiration call finalizes unattended attempts; reads also reconcile expired attempts.

## Rendering and interaction

The visual system uses CSS variables and Tailwind 4, semantic HTML, native dialogs, Lucide icons, and Recharts. A small accessible component system replaces shadcn. React Hook Form with Zod handles sign-in; native form controls handle the larger management forms and all requests are validated again by Zod on the server. This keeps critical input rules centralized.

Theme preferences are stored locally; authentication tokens and answers are not. Autosave retries pending edits in memory and warns before leaving with unsaved changes. A hard refresh before a successful save can lose unsaved edits; the UI communicates this condition.
