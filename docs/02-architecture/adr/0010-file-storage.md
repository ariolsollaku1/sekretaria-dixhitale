# ADR-0010 — File storage behind an interface

- **Status:** Accepted (2026-10-03)

## Context

We store uploaded files (application documents, syllabi, signed exam records) and generated files
(certificates, diplomas, contracts). Data must stay under the institution's control (SRC-150) and be
included in backups.

## Decision

- A `Storage` interface in `src/lib/storage` (`put`, `get`, `delete`, `exists`) with a
  **local filesystem** implementation writing to the `files` Docker volume (`FILES_DIR`).
- Files are addressed by an opaque `storageKey` (`yyyy/mm/<cuid>`), never by user-supplied names.
  Metadata lives in `StoredFile` (name, MIME, size, SHA-256, uploader).
- Files are **never** served statically; downloads go through a permission-checked route handler.
- An S3-compatible implementation can be added later without changing callers.

## Consequences

- Backups = `pg_dump` + tar of the `files` volume (PLT-13).
- Single-host only until an S3 adapter exists — fine for this deployment.

## Implementation notes (PLT-08)

- Purposes (`registerFilePurpose`) carry the upload permission, size limit, MIME allow-list and a
  `canRead(user, file)` rule; uploads are `PENDING` until a module calls `attachFile`.
- The type is detected from the file's bytes (PDF, JPEG, PNG, DOCX, XLSX); the browser-declared
  type must agree. Files are soft-deleted only; unattached uploads older than 24 h are purged by
  `cleanupOrphans` (scheduled by PLT-12).
- Backup scope is exactly: the Postgres databases + the `files` volume; `verifyFile` checks a
  restored file against its stored SHA-256.
