# ADR-0007 — PDF generation with Gotenberg

- **Status:** Accepted (2026-10-03)

## Context

The system produces many official documents: certificates, transcripts, exam records
(procesverbal), course registers, contracts, diplomas and supplements. They must match approved
layouts precisely, support Albanian characters, and be versioned per academic year.

## Decision

- Documents are **HTML + CSS templates** rendered server-side (React components rendered to static
  HTML, or Handlebars-style templates stored in `DocumentTemplate`), then converted to PDF by
  **Gotenberg** (Chromium) running as a container in the stack.
- Templates are **versioned** and selected by document type + validity date/academic year, so old
  documents can be regenerated exactly as issued.
- Every issued document gets a **number**, is stored as a file (PLT-08) with its SHA-256, and gets
  an `IssuedDocument` row; reprints reuse the stored file, not a regeneration.
- Fonts are bundled in the Gotenberg image/template (no external font fetches).

## Consequences

- Designers can build layouts with familiar HTML/CSS (`@page`, print CSS).
- One more container (Gotenberg); no Chromium inside the app image.

## Alternatives considered

- `@react-pdf/renderer` — no Chromium, but layout model differs from HTML/CSS and is harder for
  pixel-precise official forms.
- Playwright/Puppeteer inside the app container — heavier app image, same result as Gotenberg.
