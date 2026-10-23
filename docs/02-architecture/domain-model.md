# Domain model (conceptual)

This is the **shared map** of entities so features stay consistent. It is conceptual: exact
columns, constraints and indexes are designed in each feature's spec and live in
`prisma/schema/<module>.prisma`. When a spec changes an entity here, update this file in the same
change.

Terms: [../01-product/glossary.md](../01-product/glossary.md).

## Core rules

1. **Academic-year scoping** (SRC-001, ADR-0006). Records that change year to year carry
   `academicYearId`: groups, yearly registrations, teaching assignments, calendar events, exam
   sessions, syllabi, approved templates. Finance amounts are reported by **calendar year** (dates
   on installments/payments), but each payment plan is still linked to the academic year it pays for.
2. **Person is shared.** Students and staff are both `Person`s (one person can be both — e.g. a
   lecturer doing a master's). Personal data lives once on `Person`.
3. **Status changes are events.** Enrollment status, grade changes and approvals keep history rows;
   the current value is denormalized on the main row for fast queries.
4. **Approved = immutable.** Approved curriculum plans, finalized grades, issued documents are
   never edited in place; changes create a new version/correction row.
5. **IDs** are `cuid2` strings (`id`), plus human codes where users need them (program code, NIM,
   document numbers). Every table has `createdAt`, `updatedAt`; business tables also
   `createdById`, `updatedById`.

## Entity map

```mermaid
erDiagram
  Person ||--o| Student : "is"
  Person ||--o| Staff : "is"
  Person ||--o| User : "logs in as"
  User ||--o{ UserRole : has

  Faculty ||--o{ Department : has
  Department ||--o{ StudyProgram : owns
  StudyProgram ||--o{ CurriculumPlan : "versions"
  StudyProgram ||--o{ Cohort : has
  CurriculumPlan ||--o{ PlanCourse : contains
  Course ||--o{ PlanCourse : "placed as"
  Cohort }o--|| CurriculumPlan : follows
  Cohort ||--o{ StudentGroup : "split into (per year)"
  AcademicYear ||--o{ Semester : has

  Student ||--o{ Enrollment : "enrolls in"
  Enrollment }o--|| StudyProgram : in
  Enrollment }o--|| Cohort : in
  Enrollment ||--o{ YearRegistration : "registers each year"
  YearRegistration }o--|| StudentGroup : in
  Enrollment ||--o{ EnrollmentStatusEvent : history

  PlanCourse ||--o{ TeachingAssignment : "taught via"
  Staff ||--o{ TeachingAssignment : teaches
  StudentGroup ||--o{ TeachingAssignment : for

  TeachingAssignment ||--o{ ClassSession : "held as"
  ClassSession ||--o{ AttendanceRecord : records

  ExamSession ||--o{ Exam : schedules
  Exam }o--|| PlanCourse : for
  Exam ||--o{ ExamRegistration : has
  ExamRegistration }o--|| Enrollment : by
  ExamRegistration ||--o| ExamGrade : gets
  Enrollment ||--o{ CourseResult : "accumulates"

  Enrollment ||--o{ PaymentPlan : "pays via"
  PaymentPlan ||--o{ Installment : has
  Installment ||--o{ Payment : "settled by"
  Enrollment ||--o{ Scholarship : receives

  Enrollment ||--o| Graduation : "ends with"
  Graduation ||--o| Diploma : issues
```

## Entities by module

### PLT / IAM — platform
| Entity | Purpose |
|---|---|
| `User` | Login identity in the app; `keycloakId`, `email`, `active`, optional `personId`. |
| `UserRole` | Role assignment: `role`, `scopeType`, `scopeId`, `validFrom/To`. |
| `Session`, `Account`, `Verification` | Better Auth tables (names per library). |
| `AuditLog` | `actorId`, `action`, `entityType`, `entityId`, `before`, `after` (JSON), `ip`, `at`. |
| `StoredFile` | `storageKey`, `purpose`, `fileName`, `mimeType`, `size`, `sha256`, `status` (PENDING/ATTACHED), `entityType`/`entityId`, `uploadedById`, `deletedAt`. |
| `DocumentTemplate` | Versioned HTML templates for PDFs, per `type` and validity (academic year). |
| `Notification` | In-app notification per user: `type`, `payload`, `readAt`. |
| `EmailOutbox` | Queued/sent emails with status, for traceability. |
| `FormDefinition` / `FormSubmission` / `FormSubmissionEvent` | Forms engine (ADR-0009). |
| `SystemSetting` | Runtime settings: `key` (PK) → JSON `value`, `updatedAt`, `updatedById` (PLT-03, implemented). |

### ORG — structure
| Entity | Key fields |
|---|---|
| `AcademicYear` | `code` ("2026-2027"), `startDate`, `endDate`, `status` (PLANNED/CURRENT/CLOSED) |
| `Semester` | `academicYearId`, `number` (1/2), dates |
| `Faculty` | `code`, `name`, `active` |
| `Department` | `facultyId`, `code`, `name`, `headStaffId?`, `active` |
| `StudyProgram` | `departmentId`, `code`, `name`, `cycle` (FIRST/SECOND), `durationYears` (1/2/3), `totalCredits`, `coordinatorStaffId?`, `active` |
| `Cohort` | `programId`, `startAcademicYearId`, `curriculumPlanId`, `name` |
| `StudentGroup` | `cohortId`, `academicYearId`, `yearOfStudy`, `name`, `capacity?` |

### CUR — curriculum
| Entity | Key fields |
|---|---|
| `Course` | `code`, `name`, `defaultCredits`, `category`, `hoursLecture`, `hoursSeminar`, `hoursLab`, `active` |
| `CurriculumPlan` | `programId`, `version`, `validFromAcademicYearId`, `status` (DRAFT/APPROVED/ARCHIVED), `approvedAt`, `approvedById` |
| `PlanCourse` | `planId`, `courseId`, `yearOfStudy`, `semester`, `credits`, `category`, hours, `isElective` |
| `Syllabus` | `planCourseId`, `academicYearId`, `fileId` or structured content, `status` |
| `TeachingAssignment` | `academicYearId`, `semester`, `planCourseId`, `groupId`, `staffId`, `kind` (LECTURE/SEMINAR/LAB), `plannedHours` |
| `ApprovedDocument` | Archive of approved plan/syllabus/diploma & supplement forms per academic year (SRC-111/112) |

### STU / ADM — students & admissions
| Entity | Key fields |
|---|---|
| `Person` | `firstName`, `lastName`, `fatherName`, `gender`, `birthDate`, `birthPlace`, `nationalId`, `phone`, `email`, `address`, `residence` (city/municipality) |
| `Lead` | interest-form contact: name, email, phone, program of interest, source (website/campaign/event), consent |
| `Application` | `personData` (snapshot), `programId`, `academicYearId`, `highSchoolAverage`, documents, `status` (SUBMITTED/IN_REVIEW/ACCEPTED/REJECTED/ENROLLED) |
| `Student` | `personId`, `nim?` (from SMIAL), `studentNumber` (internal) |
| `Enrollment` | `studentId`, `programId`, `cohortId`, `registrationType` (FIRST_TIME/SECOND_PROGRAM/TRANSFER), `status` (ACTIVE/SUSPENDED/DEREGISTERED/GRADUATED), `startedAt`, `endedAt` |
| `YearRegistration` | `enrollmentId`, `academicYearId`, `yearOfStudy`, `groupId` |
| `EnrollmentStatusEvent` | `enrollmentId`, `from`, `to`, `reason`, `effectiveDate`, `documentRef` |

### CAL / ATT — calendar, timetable, attendance
| Entity | Key fields |
|---|---|
| `CalendarEvent` | `academicYearId`, `type` (TEACHING_WEEK/HOLIDAY/DEADLINE/EXAM_PERIOD/EVENT), `title`, `start`, `end`, `audience` |
| `TimetableEntry` | `teachingAssignmentId`, `weekday`, `startTime`, `endTime`, `room`, `validFrom/To` |
| `ClassSession` | `teachingAssignmentId`, `date`, `hours`, `held` (bool) — basis for attendance and delivered hours |
| `AttendanceRecord` | `classSessionId`, `enrollmentId`, `status` (PRESENT/ABSENT/EXCUSED) |

### EXM — exams & grades
| Entity | Key fields |
|---|---|
| `GradingScheme` | scale, pass mark, rounding, component weights (Q-11) |
| `AssessmentComponent` / `AssessmentResult` | partial assessments per teaching assignment and their results |
| `ExamSession` | `academicYearId`, `type` (WINTER/SUMMER/AUTUMN/MINI), dates |
| `Exam` | `examSessionId`, `planCourseId`, `date`, `room`, examiners |
| `ExamRegistration` | `examId`, `enrollmentId`, `attemptType` (FIRST/RETAKE/BACKLOG/IMPROVEMENT), `eligible`, `ineligibleReason` |
| `ExamGrade` | `examRegistrationId`, `value`, `status` (DRAFT/SUBMITTED/FINAL), `finalizedAt`; corrections as `ExamGradeCorrection` |
| `ExamRecord` | generated procesverbal: `examId`, `fileId`, `signedFileId?`, status |
| `CourseResult` | `enrollmentId`, `planCourseId`, `finalGrade`, `creditsEarned`, `countingExamGradeId` — the academic achievement register (SRC-040) |

### FIN — finance
| Entity | Key fields |
|---|---|
| `FeeSchedule` | `programId`, `academicYearId`, `feeType`, `amount`, preferential rules (Q-24) |
| `StudentContract` | `enrollmentId`, `academicYearId`, number, `fileId` |
| `PaymentPlan` / `Installment` | per enrollment & academic year; `dueDate`, `amount`, `status` |
| `Payment` | `installmentId?`, `amount`, `paidAt`, `reference`, `source` (MANUAL/CSV/F5) |
| `Scholarship` | `enrollmentId`, `academicYearId`, `type` (FULL/PARTIAL), `percent`/`amount`, `reason` |
| `FinancialClearance` | computed view: per enrollment & exam session — cleared yes/no (SRC-049) |

### DOC / GRD — documents & graduation
| Entity | Key fields |
|---|---|
| `DocumentRequest` | `requesterId`, `type`, `purpose`, `status` |
| `IssuedDocument` | `type`, `number`, `protocolNumber?`, `fileId`, `issuedAt`, `issuedById`, `verificationCode` |
| `Graduation` | `enrollmentId`, `clearedAt`, `thesisTitle?`, `finalAverage` |
| `Diploma` | `graduationId`, `number`, `issuedAt`, `diplomaFileId`, `supplementFileId` |

### HR / OFF — staff & administration
| Entity | Key fields |
|---|---|
| `Staff` | `personId`, `kind` (ACADEMIC/ADMINISTRATIVE), `category` (PAE/PAK/VOLUNTEER), `degree`, `title`, `departmentId?`, `retired`, `primaryEmployer?` |
| `EmploymentContract` | `staffId`, `type`, `startDate`, `endDate`, `fileId` |
| `PerformanceEvaluation` | `staffId`, `evaluatorId`, `period`, form submission ref, `score` |
| Staff requests | via `FormSubmission` (leave, supplies, certificates, authorizations) |

### QA / ERS / LIB / NTF
| Entity | Key fields |
|---|---|
| `Survey` / `SurveyResponse` | anonymous student evaluations (responses not linked to the student) |
| `AlumniRecord` | `personId`, employment/further-studies updates over time |
| `ErasmusApplication` | via `FormSubmission` + status |
| `LibraryCardRequest`, `LibraryClearance` | depends on PLEJADES (Q-03) |
| `Announcement` | `title`, `body`, `audience` filter, `publishAt`, `expiresAt` |
| `Event` / `EventRegistration` | extracurricular activities (SRC-037d) |
