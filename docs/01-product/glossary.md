# Glossary (Albanian ↔ English)

Use the **English term** in code, UI copy and docs. The Albanian term is what users and official
documents say. Code identifiers use the "Code name" column.

## Institution & systems

| Albanian | English | Code name | Notes |
|---|---|---|---|
| Kolegji Universitar LOGOS | LOGOS University College | — | The client institution. |
| MAS / MA — Ministria e Arsimit (dhe Sportit) | Ministry of Education (and Sport) | — | Approves diploma/supplement formats (SRC-059). |
| SMIAL | Ministry's higher-education information system | `smial` | Issues the NIM for every student (SRC-023). External system. |
| NIM — Numri i Matrikullimit | Matriculation number | `nim` | National student number issued via SMIAL. Shown on certificates (SRC-048). |
| F5 / Financa 5 | Financa 5 (accounting software) | `f5` | Used by the Finance Office (SRC-080, SRC-081). External system. |
| PLEJADES | PLEJADES (library system) | `plejades` | Used by the library (SRC-100). External system. |
| NJSBC — Njësia e Sigurimit të Brendshëm të Cilësisë | Internal Quality Assurance Unit | `quality` | Runs evaluations and alumni tracking (SRC-120…123). |
| Zyra e Çështjeve Studentore | Student Affairs Office | `student-affairs` | Handles candidates, interest forms, notices. |
| Sekretaria (mësimore) | Secretariat (academic registry) | `secretariat` | Owns student records, exams, registers, certificates. |
| Burimet Njerëzore (BNJ) | Human Resources | `hr` | |
| Zyra e Financës | Finance Office | `finance` | |
| Zyra Erasmus | Erasmus Office | `erasmus` | |
| Administrata | Administration | `administration` | General administrative office. |

## Academic structure

| Albanian | English | Code name | Notes |
|---|---|---|---|
| Vit akademik | Academic year | `AcademicYear` | Main time axis of the system (SRC-001). E.g. `2026-2027`. |
| Vit kalendarik | Calendar year | — | Time axis for finance only (SRC-001). |
| Semestër | Semester | `Semester` | |
| Fakultet | Faculty | `Faculty` | |
| Departament | Department | `Department` | Belongs to a faculty. |
| Cikli i parë | First cycle (Bachelor) | `StudyCycle.FIRST` | 3-year programs. |
| Cikli i dytë | Second cycle (Master) | `StudyCycle.SECOND` | 1- or 2-year programs. |
| Program studimi | Study program | `StudyProgram` | |
| Koordinator programi | Program coordinator | `program-coordinator` | Mentioned in SRC-111. |
| Drejtues / Përgjegjës departamenti | Head of department | `head-of-department` | Evaluates lecturers (SRC-065). |
| Brez | Cohort | `Cohort` | Students who started a program in the same academic year and follow the same plan version. |
| Grup studentor | Student group | `StudentGroup` | Division of a cohort for teaching. |
| Plan mësimor | Curriculum plan | `CurriculumPlan` | Courses × years × semesters for a cohort (SRC-013). |
| Lëndë | Course (subject) | `Course` | |
| Kategoria e lëndës | Course category | `Course.category` | Category as defined in the approved plan. |
| Kredite (ECTS) | Credits | `credits` | |
| Fondi i orëve | Hours allocation | `hours*` | Contact hours to deliver (lecture/seminar/lab). |
| Syllabus | Syllabus | `Syllabus` | |
| Ngarkesa mësimore | Teaching load | `TeachingAssignment` | Courses/hours assigned to a lecturer. |

## Students

| Albanian | English | Code name | Notes |
|---|---|---|---|
| Kandidat | Candidate / applicant | `Application` | Person who applied, not yet a student. |
| Formular interesimi | Interest form | `Lead` | Pre-application contact data (SRC-030/031). |
| Aplikim | Application | `Application` | |
| Regjistrim | Registration / enrollment | `Enrollment` | |
| Regjistrim për herë të parë | First-time registration | `RegistrationType.FIRST_TIME` | SRC-051 |
| Program i dytë | Second program | `RegistrationType.SECOND_PROGRAM` | SRC-051 |
| Transferim | Transfer | `RegistrationType.TRANSFER` | SRC-051 |
| Çregjistrim | Deregistration (withdrawal) | `EnrollmentStatus.DEREGISTERED` | SRC-037b, SRC-053 |
| Pezullim studimesh | Suspension of studies | `EnrollmentStatus.SUSPENDED` | SRC-054 |
| I diplomuar | Graduated | `EnrollmentStatus.GRADUATED` | SRC-059 |
| Alumni | Alumni (graduates) | — | No system access after graduation (SRC-037). |
| Student i prapambetur | Backlog student | — | Student with outstanding courses/exams from earlier years. |
| Lëndë e mbartur / e mbetur | Carried-over / outstanding course | — | Course not yet passed, carried to the next year. |
| Njohje e dokumentacionit | Recognition of prior studies/documents | — | SRC-037c |
| Mesatarja e shkollës së mesme | High-school average | `highSchoolAverage` | SRC-022 |
| Bursë (e plotë / e pjesshme) | Scholarship (full / partial) | `Scholarship` | SRC-083 |

## Exams & grades

| Albanian | English | Code name | Notes |
|---|---|---|---|
| Sezon provimesh (dimër / verë / vjeshtë) | Exam session (winter / summer / autumn) | `ExamSession` | |
| Minisezon | Mini-session | `ExamSessionType.MINI` | Extra session for final-year students (SRC-052). |
| Procesverbal | Exam record | `ExamRecord` | Official signed record of an exam's students and grades (SRC-014). |
| Provim i prapambetur | Backlog exam | `AttemptType.BACKLOG` | |
| Përsëritje | Retake | `AttemptType.RETAKE` | |
| Përmirësim note | Grade improvement | `AttemptType.IMPROVEMENT` | Usually in the autumn session (SRC-044). |
| Kontroll i pjesshëm | Partial assessment / midterm | `AssessmentComponent` | SRC-043 |
| Notë | Grade | `Grade` | |
| Mesatare e ponderuar | Credit-weighted average | `weightedAverage` | SRC-046 |
| Frekuentim / mungesa | Attendance / absences | `Attendance` | |
| Regjistri i kursit | Course register | — | Per-course record of students, attendance and grades (SRC-041). |

## Documents & registers

| Albanian | English | Code name | Notes |
|---|---|---|---|
| Vërtetim | Certificate (official letter) | `IssuedDocument` | |
| Vërtetim statusi studenti | Student status certificate | `DocumentType.STATUS_CERTIFICATE` | SRC-012a, SRC-048 |
| Vërtetim notash | Grades certificate | `DocumentType.GRADES_CERTIFICATE` | SRC-012b |
| Vërtetim notash dhe kreditesh | Grades & credits certificate (transcript) | `DocumentType.TRANSCRIPT` | SRC-012c, SRC-047 |
| Vërtetim frekuentimi | Attendance certificate | `DocumentType.ATTENDANCE_CERTIFICATE` | SRC-012d |
| Diplomë | Diploma | `Diploma` | |
| Suplement diplome | Diploma supplement | `DiplomaSupplement` | |
| Regjistri themeltar | Main register | — | Official master register of students (SRC-040). |
| Regjistri i arritjeve akademike | Academic achievement register | — | Grades per student/program/course/year/semester (SRC-040). |
| Regjistri i diplomave | Diploma register | — | SRC-040 |
| Nr. protokolli | Protocol number | `protocolNumber` | Outgoing-document number (to be confirmed, Q-07). |

## Finance

| Albanian | English | Code name | Notes |
|---|---|---|---|
| Tarifë shkollimi | Tuition fee | `FeeType.TUITION` | |
| Tarifë administrative | Administrative fee | `FeeType.ADMINISTRATIVE` | |
| Tarifë diplome | Diploma fee | `FeeType.DIPLOMA` | |
| Kontrata e studentit / aneksi | Student contract / annex | `StudentContract` | The annex defines the installment schedule (SRC-085). |
| Këst | Installment | `Installment` | |
| Detyrime financiare | Financial obligations | — | Unpaid amounts due. |
| Faturim | Invoicing | — | SRC-032 |

## Staff

| Albanian | English | Code name | Notes |
|---|---|---|---|
| Pedagog | Lecturer | `Staff` (academic) | |
| PAE | Internal full-time academic staff | `StaffCategory.PAE` | SRC-060 |
| PAK | External part-time academic staff | `StaffCategory.PAK` | SRC-060 |
| Pedagog vullnetar | Volunteer lecturer | `StaffCategory.VOLUNTEER` | SRC-069 |
| Pedagog i ftuar | Guest lecturer | — | SRC-072 |
| Grada / titulli | Academic degree / academic title | `degree`, `title` | E.g. degree "Dr.", title "Prof. Asoc." |
| Punë primare | Primary employment | `primaryEmployer` | For external lecturers (SRC-067). |
| Kontratë pune | Employment contract | `EmploymentContract` | |
| Leje | Leave | — | SRC-140 |
| Kancelari | Office supplies | — | SRC-140 |
| Autorizim | Authorization | — | SRC-140 |
| Eprori i drejtpërdrejtë | Direct supervisor | — | SRC-141 |
