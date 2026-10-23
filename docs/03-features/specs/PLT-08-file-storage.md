# PLT-08 — File storage

| | |
|---|---|
| **Phase** | P1 |
| **Depends on** | PLT-05 |
| **Questions** | Q-26 (answered: stay host-agnostic, all data under the institution's control). Q-27 (open, non-blocking): limits and retention — working assumption below, everything configurable per purpose |
| **Source** | SRC-150 |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

> Spec lifecycle: write from this template → review with the user → set Status `specced` in
> FEATURES.md → build task by task → tick tasks → Status `done`.

## 1. Context

Applications, syllabi, signed exam records, contracts and generated certificates are files, and
SRC-150 requires that the institution keeps all of its data (and its backups) under its own
control. [ADR-0010](../../02-architecture/adr/0010-file-storage.md) decided: a `Storage` interface
with a local-volume implementation, opaque storage keys, metadata in `StoredFile`, and downloads
only through a permission-checked route. This feature builds that foundation so later features
(CUR-03, PLT-09, PLT-15, PLT-13, HR) only declare an upload *purpose* and attach files to their
records. `files` volume and `FILES_DIR` already exist from PLT-02.

## 2. Requirements

### User stories

- As a **developer**, I want to declare an upload purpose (permission, size limit, allowed types)
  and get a safe upload endpoint, a download route and an upload component, so that no module
  writes its own file handling.
- As a **user**, I want to upload a document and see it listed on my record, and download it again
  if I am allowed to, so that paper copies are not needed.
- As the **client's operator**, I want files kept on the Docker volume only and addressable by
  opaque keys, so that backups are `pg_dump` + one folder and nothing is publicly reachable.

### Acceptance criteria (EARS)

| ID | Criterion |
|---|---|
| AC-1 | THE SYSTEM SHALL provide a `Storage` interface (`put`, `get`, `delete`, `exists`) with a local-filesystem implementation that writes below `FILES_DIR` and addresses files only by an opaque `storageKey` of the form `yyyy/mm/<cuid>`. |
| AC-2 | THE SYSTEM SHALL let modules register an upload **purpose** `{ id, uploadPermission, maxBytes, mimeTypes, canRead }` and SHALL reject uploads for an unregistered purpose. |
| AC-3 | WHEN an authenticated user uploads a file to `POST /api/files` for a purpose they may upload to, THE SYSTEM SHALL store it, record a `StoredFile` (original name, detected MIME type, size, SHA-256, uploader, purpose, status `PENDING`) and an audit entry, and return the file id. |
| AC-4 | IF the file exceeds the purpose's `maxBytes`, or its content type is not on the purpose's allow-list, or the declared type does not match the type detected from the file's first bytes, THEN THE SYSTEM SHALL reject it with a typed error and store nothing. |
| AC-5 | IF the user lacks the purpose's upload permission, or is not signed in, THEN THE SYSTEM SHALL answer 403 or 401 and store nothing. |
| AC-6 | THE SYSTEM SHALL never derive a path from user input: the original file name is stored as metadata only, sanitized for display and for the download header. |
| AC-7 | WHEN a user requests `GET /api/files/{id}`, THE SYSTEM SHALL stream the file only if the purpose's `canRead(user, file)` is true (the uploader may always read a file that is still `PENDING`), and SHALL answer 404 for unknown, deleted or unreadable files. |
| AC-8 | THE SYSTEM SHALL send downloads with `Content-Disposition: attachment`, the stored MIME type, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` and a `Content-Security-Policy: sandbox` header, and SHALL NOT serve files from any static path. |
| AC-9 | WHEN a module calls `attachFile(tx, fileId, { entityType, entityId })` inside its transaction, THE SYSTEM SHALL mark the file `ATTACHED` to that record; attaching a file that is already attached to another record, or deleted, SHALL fail. |
| AC-10 | WHEN a module calls `removeFile(tx, fileId, reason)`, THE SYSTEM SHALL soft-delete it (`deletedAt`), audit it, and keep the bytes (no hard deletes of business data). |
| AC-11 | THE SYSTEM SHALL provide `cleanupOrphans({ olderThan })` that deletes `PENDING` files older than the threshold (default 24 h) from the database and the storage, and SHALL NOT touch attached or soft-deleted files; PLT-12 schedules it. |
| AC-12 | THE SYSTEM SHALL provide a `<FileUpload purpose … />` component with a labelled file input, client-side size/type pre-checks, progress/pending state, translated errors and an accessible result message. |
| AC-13 | THE SYSTEM SHALL record the SHA-256 of the stored bytes and WHEN a file is read back SHALL be able to verify it (`verifyFile`) so backup restores can be checked (PLT-13). |
| AC-14 | THE SYSTEM SHALL ship the permissions `plt.file.upload` and `plt.file.read` (granted to `sysadmin`) and a general-purpose upload purpose `general` that uses them, as the reference implementation. |

### Out of scope

Virus scanning (Q-27, assumption: none), image resizing/thumbnails, resumable or chunked uploads,
S3 storage (the interface allows it later), per-file expiry/retention enforcement (Q-16/Q-27),
generating PDFs (PLT-09), the backup of the volume (PLT-13).

### Assumptions

- Defaults (Q-27, working assumption): 10 MB per file; `application/pdf`, `image/jpeg`,
  `image/png`; the `general` purpose additionally allows DOCX/XLSX. Each purpose overrides them.
- Single host: the local filesystem is the only storage until an S3 adapter exists (ADR-0010).
- Files are uploaded first (as `PENDING`), then attached when the owning record is saved; a form
  that is abandoned leaves an orphan that the cleanup removes.

## 3. Design

### Data model

```prisma
// prisma/schema/platform.prisma
enum FileStatus { PENDING ATTACHED }

model StoredFile {
  id           String     @id @default(cuid(2))
  storageKey   String     @unique @map("storage_key")
  purpose      String
  fileName     String     @map("file_name")           // sanitized original name, display only
  mimeType     String     @map("mime_type")
  size         Int
  sha256       String
  status       FileStatus @default(PENDING)
  entityType   String?    @map("entity_type")         // set by attachFile
  entityId     String?    @map("entity_id")
  uploadedById String     @map("uploaded_by_id")
  createdAt    DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)
  attachedAt   DateTime?  @map("attached_at") @db.Timestamptz(3)
  deletedAt    DateTime?  @map("deleted_at") @db.Timestamptz(3)
  deletedById  String?    @map("deleted_by_id")
  @@index([entityType, entityId])
  @@index([status, createdAt])
  @@map("stored_files")
}
```

`size` is limited by the purpose (≤ 2 GB would need BigInt; `Int` is fine for the 10 MB default —
a purpose may not set `maxBytes` above 100 MB). Updates [domain-model.md](../../02-architecture/domain-model.md)
(`StoredFile` row gains `purpose`, `status`, `entityType/entityId`, `deletedAt`).

### Permissions

| Permission | Granted to |
|---|---|
| `plt.file.upload` | sysadmin (purpose `general`) |
| `plt.file.read` | sysadmin (purpose `general`) |

Other purposes declare their own permissions in their module.

### Server

| Kind | Name | Purpose |
|---|---|---|
| lib | `src/lib/storage/storage.ts` | `Storage` interface + `StorageError` |
| lib | `src/lib/storage/local.ts` | `LocalStorage(rootDir)`: atomic write (temp file + rename), key validation, directory creation, path-escape guard |
| lib | `src/lib/storage/index.ts` | `getStorage()` singleton from `FILES_DIR`; `setStorage()` for tests |
| domain | `src/lib/files/mime.ts` | pure: magic-byte detection for the allow-listed types, `isAllowed(purpose, detected, declared)`, `sanitizeFileName` |
| domain | `src/lib/files/purposes.ts` | `registerFilePurpose`, `getFilePurpose`; validates `maxBytes ≤ 100 MB` |
| service | `src/lib/files/files.service.ts` | `storeUpload`, `attachFile`, `removeFile`, `openFile`, `verifyFile`, `cleanupOrphans` |
| route | `POST /api/files` | multipart upload (`purpose`, `file`); rejects early on `Content-Length` > purpose max + 1 MB |
| route | `GET /api/files/[id]` | permission-checked streaming download |
| UI | `src/components/files/file-upload.tsx` | the component (AC-12) |

Upload flow: authenticate → purpose lookup → permission → size gate → read bytes → detect type →
allow-list check → SHA-256 → `storage.put` → insert `StoredFile` + audit in one transaction; if the
insert fails the stored object is deleted again (compensation, via the action-wrapper hook idea:
the route does it explicitly).

### UI

| Route | Who | What |
|---|---|---|
| (no page of its own) | — | `<FileUpload purpose="general" />` is used by features; the e2e test mounts it on a small internal page `/admin/files` (sysadmin only) that lists the latest uploads with download links |

### Jobs, events, integrations

`cleanupOrphans` is a plain function; PLT-12 registers a nightly job. No events.

### Edge cases & errors

- Empty file (0 bytes) → rejected (`EMPTY`).
- Two uploads of identical bytes → two rows, two objects (no deduplication; keeps deletion simple).
- Storage write succeeds but the DB insert fails → the object is deleted; if that delete fails the
  orphan sweep of the volume (a future PLT-13 consistency check) finds it by key.
- Storage read fails for an existing row → 500 with a log line (ids only); the row stays.
- File names with `../`, control characters, very long names, or RTL/Unicode tricks → sanitized;
  the download header uses RFC 5987 `filename*`.
- Concurrent `attachFile` on one file → the conditional update (`where status = PENDING`) lets one
  win; the other gets `ALREADY_ATTACHED`.

## 4. Tasks

- [ ] **T1** — `StoredFile` model + `FileStatus` + migration; `plt.file.*` permissions. (AC-3, AC-14)
- [ ] **T2** — `Storage` interface and `LocalStorage` with tests (key format, traversal, atomic put,
      delete, exists). (AC-1, AC-6)
- [ ] **T3** — Pure `mime` detection / allow-list / `sanitizeFileName` + purpose registry, unit tests. (AC-2, AC-4, AC-6)
- [ ] **T4** — `files.service`: `storeUpload`, `attachFile`, `removeFile`, `verifyFile`,
      `cleanupOrphans` with audit, integration tests. (AC-3, AC-9, AC-10, AC-11, AC-13)
- [ ] **T5** — Routes `POST /api/files`, `GET /api/files/[id]` with headers and permission checks;
      `general` purpose. (AC-5, AC-7, AC-8, AC-14)
- [ ] **T6** — `<FileUpload>` component, `/admin/files` demo page, nav entry, i18n (`files.*`). (AC-12)
- [ ] **T7** — E2E (upload → list → download, forbidden, oversize, wrong type); docs: ADR-0010
      note, README (volume = backup scope), domain model. (all)

## 5. Test plan

| AC | Test type | Test |
|---|---|---|
| AC-1 | integration (temp dir) | put/get/exists/delete round trip; key matches `yyyy/mm/<id>`; `../` and absolute keys rejected; failed write leaves no partial file |
| AC-2 | unit | unregistered purpose rejected; `maxBytes > 100 MB` rejected at registration |
| AC-3 | integration | upload stores bytes, row (hash, size, mime, PENDING) and one audit row |
| AC-4 | unit + integration | oversize, empty, wrong type, declared≠detected → typed error, nothing stored |
| AC-5 | route test | no session → 401; no permission → 403; nothing stored |
| AC-6 | unit | `sanitizeFileName` cases (traversal, control chars, long, unicode, empty) |
| AC-7 | integration | readable by permission holder; uploader reads own PENDING; others 404; deleted 404 |
| AC-8 | route test | response headers present; no static path exposes the volume |
| AC-9 | integration | attach once ok; second attach fails; concurrent attach has one winner |
| AC-10 | integration | removeFile sets `deletedAt`, keeps bytes, audits with reason |
| AC-11 | integration | old PENDING removed from DB + storage; recent PENDING, ATTACHED and deleted untouched |
| AC-12 | e2e + axe | upload via the component shows result; oversize and wrong-type messages; no serious axe violations |
| AC-13 | integration | `verifyFile` true for intact, false after the stored bytes are altered |
| AC-14 | e2e | sysadmin uploads and downloads; secretary gets 403 on the page and API |

## 6. Definition of done

- [ ] All tasks ticked, all ACs covered by tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass; E2E for user-facing flows pass
- [ ] Security checklist in [conventions.md](../../02-architecture/conventions.md#security-checklist-every-feature) satisfied (size limit, MIME allow-list, outside web root, permission-checked route)
- [ ] i18n keys added (`en` and `sq`)
- [ ] Docs updated (domain model, ADR-0010 consequences, README backup scope)
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
