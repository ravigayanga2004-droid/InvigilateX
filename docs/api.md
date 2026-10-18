# API reference

Additional management endpoints: `PATCH /api/courses/:id` edits a course (administrator only; instructor transfer is blocked after examinations exist). `GET /api/institution` exposes the institution's public name, support email, and activity guidance. `GET /api/insights` gives authorized staff question facility, a discrimination approximation, and course usage.

All endpoints are under `/api`. JSON success responses contain the relevant record or operation result. Errors use `{ "error": "safe message", "errorId": "optional correlation ID" }`. Standard statuses: 200, 201, 400, 401, 403, 404, 409, 413, 429, and 500. Protected requests require the session cookie. POST/PATCH requests require a same-origin `Origin` and JSON body. Unknown fields are rejected. No public endpoint accepts a score for an objective question.

| Method    | Route                                                                 | Purpose / authorization                                                         |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| GET       | `/session`                                                            | Current public-safe user and registration flag                                  |
| POST      | `/auth/login`, `/auth/logout`                                         | Create/revoke session                                                           |
| POST      | `/auth/register`                                                      | Opt-in student registration                                                     |
| POST      | `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` | Generic recovery / one-time tokens                                              |
| GET       | `/dashboard`                                                          | Role-scoped overview and recent attempts                                        |
| GET/POST  | `/exams`                                                              | Assigned/owned paginated exams / staff draft creation                           |
| GET/PATCH | `/exams/:id`                                                          | Safe student instructions or full staff authoring / edit untouched draft        |
| POST      | `/exams/:id/publish`, `/unpublish`, `/archive`, `/duplicate`          | Owner/admin lifecycle transitions                                               |
| POST      | `/exams/:id/assign`                                                   | Assign active student emails                                                    |
| POST      | `/exams/:id/start`                                                    | Assigned student; create/resume transactional attempt                           |
| GET       | `/attempts/:id`                                                       | Student owner or authorized educator; explicit answer allowlist                 |
| POST      | `/attempts/:id/answer`                                                | `{questionId,text,optionIds,revision,flagged?}`; deadline and membership checks |
| POST      | `/attempts/:id/submit`                                                | Idempotent student final submission                                             |
| POST      | `/attempts/:id/events`                                                | Allowlisted event type; no clipboard or answer metadata                         |
| POST      | `/attempts/:id/grade`                                                 | Owner/admin grade, release, or audited reopen                                   |
| GET/POST  | `/courses`                                                            | Scoped course list / admin creation                                             |
| POST      | `/enrollments`, `/enrollments/import`                                 | Owner/admin atomic enrollment; import preview before confirmation               |
| GET/POST  | `/banks`, `/questions`                                                | Staff-owned banks/questions and creation                                        |
| POST      | `/questions/import`                                                   | CSV/JSON validation preview; `confirm=true` imports all valid rows atomically   |
| PATCH     | `/questions/:id`                                                      | Retire a question without deleting history                                      |
| GET/POST  | `/people`                                                             | Admin-only paginated user list / creation                                       |
| PATCH     | `/people/:id`                                                         | Admin name/role/status update; revokes sessions                                 |
| GET       | `/instructors`                                                        | Admin selector, minimal fields                                                  |
| PATCH     | `/profile`                                                            | Own display name / verified-current-password change                             |
| GET       | `/notifications`                                                      | Own notifications                                                               |
| POST      | `/notifications/read`                                                 | Mark own notifications read                                                     |
| GET       | `/integrity`                                                          | Owned attempt activity timelines                                                |
| POST      | `/integrity/review`                                                   | Review authorized event and audit the action                                    |
| GET       | `/audit`                                                              | Admin paginated audit trail                                                     |
| GET/PATCH | `/settings`                                                           | Admin institution settings                                                      |
| GET       | `/export`                                                             | Authorized recent result CSV, formula-safe values                               |
| GET       | `/health`, `/ready`                                                   | Liveness / database readiness                                                   |
| GET       | `/cron/expire`                                                        | Bearer-secret authenticated overdue reconciliation                              |

Exams, people, and audit support `page` (25 rows) and `q` search parameters. Questions are bounded to 100 rows per request; dashboard/reports use the most recent 200 attempts and overview at most 50 exams. These limits are explicit in reporting UI. Use dedicated data extraction for institution-wide archival reporting beyond these windows.

Question import schema: `type`, `text`, `points`, optional `difficulty`, `topic`, `tags`, `explanation`, `correctText`, and `options:[{text,isCorrect}]`. CSV uses pipe-delimited tags and a JSON-encoded options cell. A sample lives in `public/templates/questions.csv`.
