# NTF — Announcements & communication

Code: `src/modules/ntf`. Delivery (in-app + email) is PLT-11.

### NTF-01 — Announcements
- **Goal:** publish notices: open lectures, workshops, seminars, registration deadlines, general
  news (SRC-033, SRC-035, SRC-036c).
- **Users:** staff offices (publish within their scope), everyone (read).
- **Scope:** announcement with title, body (rich text), attachments, audience (all, staff,
  students, by faculty/program/year/group), publish/expire dates, pin; portal feed; optional email
  push; public announcements page (for the website).
- **Built (v1, see the spec):** plain-text body, five audiences (all, staff, students, cycle, program),
  publish/expire days, pin, e-mail push, attachments. Rich text, faculty/year/group audiences and the
  public website page are deferred (Q-30).

### NTF-02 — Events & extracurricular registration
- **Goal:** students register for conferences, workshops and other activities and are notified (SRC-035, SRC-037d).
- **Scope:** event (date, place, capacity, audience) linked to an announcement; registration form
  (PLT-15, public for externals if needed); attendee list; reminders; certificate of attendance later.

### NTF-03 — Targeted messaging to lists
- **Goal:** message the students in any filtered list, e.g. backlog students about sessions and
  obligations (SRC-057).
- **Scope:** "Message these people" action on PLT-10 lists (permission-checked); compose with
  templates/placeholders; send via email + in-app; delivery log; no reply handling in v1.
- **Built (v1, see the spec):** a PLT-10 table becomes a message source by declaring `recipient(row)`
  (done for `stu.lists` and `hr.lecturers`); "Message these people" carries the table id + filters to
  `/messages/new`; plain-text subject/body with three placeholders; shared templates; sending by the
  `ntf.message.send` job in batches of 200 through `notify()`; delivery log per person. Assumptions
  Q-50…Q-54.
