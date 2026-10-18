# Security model

## Identity and access

Passwords use bcrypt cost 12 and a 12-character minimum. Inputs exceeding bcrypt's 72-byte limit are rejected, including multibyte strings. Raw passwords are neither stored nor logged. Sessions are opaque 256-bit random values: the browser gets an HTTP-only, SameSite=Lax cookie and PostgreSQL stores only a SHA-256 digest. Production cookies are Secure and sessions expire after 12 hours. Account deactivation, role changes, password changes, and recovery revoke sessions.

Every protected API request performs server-side session validation. Role checks and resource ownership apply to reads and writes. Public registration, if explicitly enabled, always creates a student. No public role input is accepted. Instructor requests are scoped to their own courses, banks, exams, submissions, and events.

## Request protection

Strict Zod schemas reject unknown properties, including injected scores/roles. Mutations require an exact match with `APP_URL`'s origin and reject cross-site fetch metadata. Session tokens are never stored in localStorage. Login uses database-backed network/email rate limits and temporary account lockouts after repeated failures. Forwarded network headers are ignored unless `TRUST_PROXY=true`; enable that only behind a proxy that overwrites them.

Reset/verification tokens are hashed, expire after 30 minutes, and are consumed atomically once. Reset responses do not identify account existence. Development delivery writes restricted files under ignored `.local/mail`; production requires SMTP. Local delivery is never exposed over HTTP. Password reset revokes all sessions and outstanding reset tokens.

## Assessment protection

All grading, eligibility, attempt limits, and deadlines are server-enforced. Row locks prevent concurrent saves, submission races, and duplicate starts. Attempts contain frozen questions and a private ordering seed. Student payloads are constructed with an explicit field allowlist; reference answers, explanations, seeds, and unreleased scores are excluded. Correct answers are shown only after release when enabled. Question content renders as escaped React text; arbitrary HTML is unsupported.

## Headers and errors

Responses set CSP, frame denial, nosniff, referrer policy, and disable camera/microphone/geolocation. HSTS is enabled in production. CSP allows inline framework scripts and styles; development additionally permits eval required by Next.js debugging. A nonce-based strict CSP is a recommended future hardening step. Do not allow user-supplied scripts, HTML, or arbitrary image URLs.

Unexpected errors return a safe error ID. Structured logs contain action/resource identifiers and error types, not passwords, tokens, or answers. Sensitive server stack traces are not returned to clients. Access logs at the reverse proxy must redact query strings on recovery links. Auth forms use POST as a fallback and remain disabled until hydration to prevent credentials entering URLs.

## Operational requirements

Use HTTPS, unique cryptographically random secrets, a private PostgreSQL network, least-privilege database credentials, encrypted backups, trusted SMTP, and an authenticated scheduled expiration call. Avoid production demo seeding. Run `npm audit --omit=dev` and inspect full development advisories separately. This project is not a substitute for an independent penetration test or institution-specific privacy review.

Retention is an institutional responsibility. There is no automatic deletion of academic records. Review `.local/mail`, expired sessions, expired reset tokens, and stale rate-limit rows as part of operational housekeeping; protect backups and limit operator access.
