# ADR-0009 — Generic forms engine

- **Status:** Accepted (2026-10-03)

## Context

The source lists many forms: interest form, application, scholarship, deregistration, document
recognition, extracurricular activities, alumni update, Erasmus (student / academic staff /
administrative staff), library card, leave, office supplies, certificates, authorizations,
performance evaluations, student evaluations of lecturers and administration (SRC-030, SRC-037,
SRC-065, SRC-102, SRC-120, SRC-121, SRC-130…133, SRC-140, SRC-141). Several must work **without
login** from the LOGOS website (SRC-037, SRC-133).

## Decision

Build one **forms engine** (PLT-15):
- `FormDefinition` — versioned JSON definition: fields (type, label keys, validation, options,
  conditional visibility), audience (`PUBLIC` / `AUTHENTICATED` with allowed roles), workflow
  (states + who may move between them), notification rules, and an optional **handler key**.
- `FormSubmission` — answers (JSONB, validated against the definition version), submitter (user or
  anonymous contact), current state, assignee; `FormSubmissionEvent` — history.
- Public forms are served at `/f/<form-key>` (embeddable by the website via link or iframe),
  protected by rate limiting and a honeypot/CAPTCHA.
- **Handlers**: when a submission is approved, an optional typed handler in the owning module runs
  domain logic (e.g. deregistration → STU status change; scholarship → FIN scholarship record).
  Handlers are code; field definitions are data.

## Consequences

- New simple forms need no code; forms with side effects need only a handler.
- Answers are JSONB — reports on form data use JSON queries or the handler writes structured rows.
- Anonymous surveys (QA-01) use the same rendering but a separate storage path that never links
  responses to identities.

## Alternatives considered

- One hand-coded page per form — ~20 forms × (UI + validation + inbox + workflow) of duplicated work.
- External form tools (Google/Microsoft Forms) — data leaves our control (SRC-150) and doesn't
  integrate with records.

## Implementation (PLT-15)

- One published version per key (partial unique index); published and archived versions are frozen
  by a trigger — a change is a new draft version.
- Public submissions: hidden honeypot (a filled one is answered like a success and stored nowhere) and a
  database-backed rate limit of 5 per address and form per 10 minutes; no CAPTCHA yet (Q-37). The
  address is never stored with the answers.
- Handlers are registered in code by key (`registerFormHandler`) and run inside the transaction of
  the approving state change; a missing or failing handler rolls it back.
