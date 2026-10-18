# Deployment and operations

## Prerequisites

Node 24, npm, PostgreSQL 18 (or a compatible PostgreSQL release), HTTPS termination, and an SMTP server for production recovery. No paid vendor is required. Keep the database private and use a dedicated application database role.

## Release steps

1. Run `npm ci` from the lockfile and configure environment variables.
2. Set `DATABASE_URL`, the canonical HTTPS `APP_URL`, 32+ character random `SESSION_SECRET` and `CRON_SECRET`, `SMTP_URL`, and `MAIL_FROM`. Keep `ALLOW_REGISTRATION=false` unless open student registration is intended. Never set `SEED_DEMO=true` in production.
3. Back up the database. Apply `npm run db:migrate` once as a deployment job before routing traffic to the new application.
4. Run the checks in `docs/testing.md`, then `npm run build` and `npm start`. Alternatively build the supplied Dockerfile and pass runtime variables to the container. The runtime image runs as a non-root user and serves on port 3000.
5. Configure a reverse proxy for TLS, request-size limits (1 MB), request timeouts, and access-log redaction. Only set `TRUST_PROXY=true` if the proxy replaces client-supplied forwarding headers.
6. Call `GET /api/cron/expire` every minute with `Authorization: Bearer <CRON_SECRET>`. Keep this secret out of URLs/logs. Each call finalizes up to 100 overdue attempts; increase scheduling frequency or invoke again when the response reports 100 processed.
7. Probe `/api/health` for liveness and `/api/ready` for database readiness. Monitor error IDs, failed logins, recovery-delivery errors, and scheduled expiration failures.

Migration tools are not included in the minimal runtime container; run migrations from the build/CI environment with database access. Environment validation executes at server initialization. Next.js builds also need syntactically valid configuration variables; builds do not need a reachable database to render static pages.

## Initial administrator

For a local demonstration use the guarded seed. For a real institution, provision the first administrator using a controlled one-time operator script with a bcrypt-hashed password, then create other accounts through People. Do not import demo identities or passwords into production. See `scripts/create-admin.ts` for a password-through-stdin provisioning path.

## Backups and restore

Schedule encrypted `pg_dump -Fc` backups using a managed secret store for connection credentials. Keep copies outside the database host, document retention, and periodically restore to an isolated database with `pg_restore`. Never test restoration over the live database. Before schema changes, take a recoverable backup and verify the previous app's schema compatibility. Forward-fix migrations or restore into a new instance and switch traffic; do not casually roll back destructive SQL.

## Local database choices

`docker compose up -d db` starts a loopback-bound PostgreSQL service with a named volume and health check. `npm run db:local` is an alternative for machines without a running Docker daemon and persists data under `.local/postgres`. Do not run both on port 54329. The embedded process is a developer convenience, not a production database manager. Stop it with Ctrl+C.
