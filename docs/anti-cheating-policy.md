# Assessment activity policy

ExamGuard records limited browser events only when enabled by the exam author. Students see the notice before starting and inside the examination room.

Supported events: hidden tab, lost focus, entered/exited fullscreen, copy/paste/cut action, context-menu action, page load/refresh, online/offline transition, long inactivity, and rapid answer changes. Manual and automatic submissions are recorded server-side independently of client reporting.

We never collect clipboard contents, keystrokes, camera, microphone, screen recording, facial recognition, or biometric data. An offline event cannot reach the server while disconnected; reconnection can be recorded. Client events can be blocked or spoofed and are not a security boundary.

Default severity is 2 for hidden tabs/fullscreen exits, 1 for clipboard/context-menu/rapid-change events, and 0 for informational events. Exam settings store configurable weights. The activity indicator is the sum: below 4 is “Low activity,” 4–11 is “Some activity,” and 12+ is “Review recommended.” The interface explains the calculation.

No event changes scores or automatically fails a student. An educator must consider context, accessibility software, device behavior, connection reliability, and the student’s explanation. Marking an event reviewed records reviewer, timestamp, and audit action.

Institutions must define retention, an appeal process, and accommodations before deployment. Fullscreen is a browser request, not an invigilation guarantee; unsupported devices can continue and should receive institutional accommodations.
