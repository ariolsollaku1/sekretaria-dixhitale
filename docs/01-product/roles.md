# Roles & access

Roles come from SRC-010. A few more are implied elsewhere in the source and marked *derived*.
Multiple roles per person, scoped roles, the derived roles and mandatory 2FA for `sysadmin` were
adopted as the design in **Q-18** (2026-10-03).

## Principles

- **Authentication** (who you are) is done by **Keycloak**. **Authorization** (what you may do) is
  decided by the **app**, from roles stored in the app database — see
  [ADR-0004](../02-architecture/adr/0004-keycloak-auth.md).
- A user can hold **several roles** (e.g. lecturer + head of department).
- A role assignment can be **scoped**: to the whole institution, a faculty, a department, or a
  study program. A secretary scoped to Faculty A only sees Faculty A's students.
- Permissions are checked **on the server** for every read and write. The UI only hides what the
  user can't use; it is never the security boundary.
- There is **no self-registration**. Staff accounts are created by HR/sysadmin; student accounts are
  created on enrollment (IAM-02). Candidates and alumni use **public forms** without an account
  (SRC-037).

## Roles

The **Key** column is the display key; in code and the database the enum values use underscores
(`student-affairs` → `student_affairs`, `head-of-department` → `head_of_department`,
`program-coordinator` → `program_coordinator`).

| Key | Role | Source | Typical scope | Description |
|---|---|---|---|---|
| `sysadmin` | System administrator | SRC-010 | institution | Manages users, roles, system settings, templates. |
| `secretary` | Secretary (Secretariat) | SRC-010 | faculty or institution | Student records, exams, grades, registers, certificates, diplomas. |
| `student-affairs` | Student Affairs Office | SRC-010 | institution | Interest forms, applications, notices, student-facing information. |
| `lecturer` | Lecturer | SRC-010 | own assignments | Attendance and grade entry for their own courses/groups; own timetable. |
| `finance` | Finance officer | SRC-010 | institution | Fees, payment plans, payments, scholarships, financial clearance. |
| `hr` | Human Resources | SRC-010 | institution | Staff register, contracts, evaluations, HR reports. |
| `quality` | NJSBC (Quality Assurance) | SRC-010 | institution | Student evaluations, alumni tracking, quality reports. |
| `library` | Librarian | SRC-010 | institution | Library cards, library obligations. |
| `administration` | Administration | SRC-010 | institution | Processes staff requests (leave, supplies, certificates, authorizations). |
| `student` | Student | SRC-010 | self | Own profile, grades, absences, timetable, calendar, requests. |
| `head-of-department` | Head of department *(derived)* | SRC-065, SRC-113 | department | Department plans/syllabi, teaching load, lecturer evaluations. |
| `program-coordinator` | Program coordinator *(derived)* | SRC-111 | program | Program plans, syllabi, approved diploma/supplement forms. |
| `erasmus` | Erasmus officer *(derived)* | SRC-130…133 | institution | Erasmus applications. |
| — | Candidate *(no account)* | SRC-030 | — | Fills interest/application forms on the website. |
| — | Alumni *(no account)* | SRC-037 | — | Fills alumni/other public forms. |

Every staff member, whatever their role, also gets **staff self-service** (submit administration
requests SRC-140, see own evaluations).

## Module access matrix (high level)

`W` = create/update, `R` = read, `r` = read limited to own/assigned records, blank = no access.
Exact permissions per feature are defined in each feature spec.

| Module | sysadmin | secretary | student-affairs | lecturer | finance | hr | quality | library | administration | student | head-of-dept | program-coord |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IAM — users & roles | W | | | | | | | | | | | |
| ORG — structure | W | R | R | R | R | R | R | | | | R | R |
| CUR — curriculum, syllabi | W | R | R | r | | R | R | | | r | W | W |
| STU — student records | R | W | W | r | R | | R | R | | r | R | R |
| ADM — admissions | R | W | W | | R | | | | | | | |
| CAL — calendar, timetable | W | W | R | r | R | R | R | R | R | r | R | R |
| ATT — attendance | | R | | W (own) | | | | | | r | R | R |
| EXM — exams, grades | | W | | W (own) | R | | | | | r | R | R |
| DOC — certificates | | W | | | | | | | | r (request) | | |
| GRD — graduation, diplomas | | W | | | R | | | | | r | R | R |
| FIN — finance | | R | R | | W | | | | | r | | |
| HR — staff | R | R | | r | R | W | R | | | | R | |
| LIB — library | | R | | | | | | W | | r | | |
| QA — evaluations, alumni | | | | r (own results) | | R | W | | | r (fill) | R | |
| ERS — Erasmus | | R | | | | | | | | r (apply) | | |
| OFF — admin requests | | r | r | r | r | R | r | r | W | | r | r |
| NTF — announcements | W | W | W | r | W | W | W | | W | r | W | W |
| RPT — reports | R | R | R | | R | R | R | | | | R | R |

Notes:
- CUR catalog (CUR-01): `cur.course.write` is held by the sysadmin (institution) and by the head of
  department **for their own department**; program coordinators read the catalog (their write
  access concerns plans and syllabi).
- SRC-087 requires that payment lists are visible to **both** Finance and Secretariat.
- SRC-063…069 are HR data that must be **readable by Finance**.
- SRC-111 requires approved diploma/supplement forms to be readable by Department, Secretariat,
  administrator and program coordinator.
