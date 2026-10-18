# Database schema

PostgreSQL migrations are tracked in `prisma/migrations`. Prisma schema is the canonical relationship reference.

| Area       | Models                                                                                   | Invariants                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Identity   | User, Session, PasswordResetToken, RateLimit                                             | Unique normalized email; hashed session and reset tokens; expiring one-time reset/verification tokens |
| Learning   | Course, Enrollment                                                                       | Unique course code and course/student pair; restricted instructor relationship                        |
| Authoring  | QuestionBank, Question, QuestionOption, Exam, ExamSettings, ExamQuestion, ExamAssignment | Ordered unique exam questions; unique assignments; reference answers remain server-side               |
| Assessment | ExamAttempt, AttemptQuestion, Answer, AnswerOption                                       | Unique attempt number per exam/student; one answer per frozen question; unique selected option IDs    |
| Outcomes   | Grade, Result                                                                            | One grade per answer and one result per attempt; decimal points and percentage stored separately      |
| Governance | AntiCheatEvent, AuditLog, Notification, PlatformSetting                                  | Minimal event metadata; timestamps, review ownership, and scoped notification access                  |

Question snapshots intentionally duplicate text and grading configuration. This preserves historical assessments after bank changes. Source questions remain related to exams, while frozen questions retain their original ID without a destructive cascade.

Foreign-key deletion is conservative: identity/session cleanup cascades where appropriate, while users with authored courses or attempts cannot be casually deleted. The product deactivates accounts and archives exams instead of deleting assessment history. Audit actors use `SET NULL` if a separately authorized retention process deletes an identity.

Indexes support sessions by expiration/user, enrollment by student, exams by instructor/status and course/window, attempts by student/status and expiration, activity timelines by attempt/time, and audit resource/time queries.

Start, save, submit, grade, and status transitions use database transactions and row locks. No cross-process mutex or in-memory attempt counter is trusted. The initial migration creates a clean schema without requiring `db push`.
