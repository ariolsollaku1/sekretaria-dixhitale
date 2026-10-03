# Requirements — English translation

> Translation of `00-01 Kerkesa-shqip _Ripunuar.docx` (Albanian original:
> [requirements-sq.md](requirements-sq.md)). Every requirement has a stable ID `SRC-xxx`; the same
> IDs appear in the Albanian transcript, the feature registry and the specs, so any feature can be
> traced back to the sentence that asked for it.
>
> Notes in *[italic brackets]* are translator remarks (ambiguities, duplicates, interpretations).
> Albanian terms are explained in [../01-product/glossary.md](../01-product/glossary.md).
>
> If the translation and the original disagree, **the Albanian original wins**.

---

# Requirements for a digitalized (web-based) system for KOLEGJI UNIVERSITAR LOGOS (LOGOS University College)

**[SRC-000]** *(Context, not a requirement.)* In the information age, web-based applications/systems and interactive services are essential for a higher-education institution to achieve its mission. Web applications and interactive services are the main means of coordinating and organizing the work processes of every unit and of interacting faster with students. A well-planned and structured project is the key factor in a successful implementation.

**[SRC-001]** For ease of operation, the system is structured by **academic years**. (The **financial module** is divided by **calendar years**.)

- **[SRC-010] Users module** — manages system users, divided into categories: secretary, student, student affairs office, lecturer, finance officer, human resources, NJSBC *(internal quality assurance unit)*, library, administration, and system administrator.
- **[SRC-011] Structure module** — manages faculties, departments, study levels (first cycle and second cycle), study programs, and the division of students into groups.
- **[SRC-012] Student management module** — manages students from the moment of application, through registration, level/cycle of study, study program, academic and financial obligations, and the generation of documents the student requests, such as:
  - **[SRC-012a]** certificate of student status,
  - **[SRC-012b]** grades certificate,
  - **[SRC-012c]** grades and credits certificate,
  - **[SRC-012d]** attendance certificate, etc.

**[SRC-013]** Integration of the 3-year, 2-year or 1-year **curriculum plan** for the respective **cohort**. The plan must include courses, course category, credits, the number of hours to be delivered, etc. *[Highlighted with `===` in the original; repeated in SRC-026.]*

- **[SRC-014]** (a) **Exam management by the Secretariat**, producing the student list or the **exam record (procesverbal)** for the respective exam(s), and the list of students **entitled to sit** a given exam (those who have closed all required academic and financial obligations).
- **[SRC-015]** (b) This module also **records exam grades**, generating the document ready to be **signed by the lecturer(s)**.
- **[SRC-016]** (c) Students can **see the grade** received in each exam taken, or in all exams up to the moment they ask, by semester.

## Secretariat

### 1 — Student

- **[SRC-020]** Personal/general data of each student: first name, last name, father's name, mobile number, email, home address, etc. *(At this stage the data are only confirmed and given final approval, because the candidate already entered them at the application stage.)*
- **[SRC-021]** Reports (name lists / statistics) of students, broken down by study cycle, study program and year of study, with criteria such as place of residence, age, gender, etc.
- **[SRC-022]** Report of the grades/results each student brings when enrolling in the first year, based on their high-school average, etc.
- **[SRC-023]** The Ministry of Education's **SMIAL** system — refers to generating the **NIM** for each person with STUDENT status.
- **[SRC-024]** Possibly integration with a communication platform such as **MS Teams**?? *[The "??" is in the original — undecided.]*

### 2 — Academic calendar

**[SRC-025]** Academic calendar (includes deadlines predefined for the academic year, organized by weeks, etc.).

### 3 — Curriculum plan

**[SRC-026]** Integration of the 3-year, 2-year or 1-year curriculum plan for the respective cohort. The plan includes courses, category, credits, hours to be delivered, etc., **and the lecturer**. *[Duplicate of SRC-013, adds "lecturer".]*

### 4 — Lecturers

**[SRC-027]** The lecturers who deliver the curriculum of each study program.

## Student Affairs Office

**[SRC-030]** *Suggestion:* candidates fill in their own personal data on the **LOGOS website**. This can be treated as an **interest form**. Also data collected during marketing campaigns or any other event. These data flow directly into the system and are then used / confirmed / processed by the Student Affairs Office and the Secretariat.

- **[SRC-031]** Interest form (Secretariat / Student Affairs Office / Finance).
- **[SRC-032]** Application – registration – invoicing.
- **[SRC-033]** Notices about registration deadlines and preferential fees on certain days (required documents, tuition fees, parts of the student contract).
- **[SRC-034]** Academic calendar, timetable, exam schedule.
- **[SRC-035]** Announcements: open lectures, workshops, seminars.
- **[SRC-036]** Online access for students to:
  - **[SRC-036a]** exam results *(Secretariat/Department & Secretariat/Student)*,
  - **[SRC-036b]** their absences, after lecturers have entered them online *(Secretariat/Department)*,
  - **[SRC-036c]** the academic calendar and other activities,
  - **[SRC-036d]** the class timetable and exam schedule.
- **[SRC-037]** Forms: forms can be opened **directly from the website**, in the relevant section, without logging into the system; once submitted, their data flow into the system. *E.g. ALUMNI no longer have access to the system after graduating, so they cannot fill a form from inside the system.*
  - **[SRC-037a]** scholarship form,
  - **[SRC-037b]** deregistration form,
  - **[SRC-037c]** document recognition form,
  - **[SRC-037d]** form for extracurricular activities (conferences, workshops, etc.) *(a notification every time something arrives in the student's account)*,
  - **[SRC-037e]** alumni data update form,
  - **[SRC-037f]** Erasmus form for students.

## Secretariat (II) — registers and reports

**[SRC-040]** Registers: **Main Register** *(Regjistri Themeltar)*; **Register of Academic Achievements** — results/grades for each student by program and course, for each year and semester; **Register of Diplomas/Graduations**.

Reports:

- **[SRC-041]** Generate the **course register** for each course.
- **[SRC-042]** Report on student **attendance**.
- **[SRC-043]** Entering grades, absences, partial-assessment (midterm) results; storing and **modifying** them (in case of error, grade improvement, repeated grade for carried-over courses, etc.).
- **[SRC-044]** List of the session's grades, of backlog exams, and of autumn grade improvements.
- **[SRC-045]** Print the report of **outstanding courses** for all students at the end of the academic year, before the autumn session.
- **[SRC-046]** Compute each student's **credit-weighted average**, to produce personal, group, faculty averages, etc.
- **[SRC-047]** Personal student certificates with grades and the corresponding credits.
- **[SRC-048]** Simple certificates of the student's current status — referencing the **NIM** (matriculation number).
- **[SRC-049]** Generate the list of students:
  - **[SRC-049a]** who **have** closed their financial obligations before the winter/summer/autumn exam session,
  - **[SRC-049b]** who **have not** closed their financial obligations before the winter/summer/autumn exam session.
- **[SRC-050]** List of students who have closed all financial and/or academic obligations.
- **[SRC-051]** List of students registered at the start of the academic year as **first-time registration, second program, or transfer**.
- **[SRC-052]** List for third-year bachelor or master students — **mini-session**.
- **[SRC-053]** List of students **deregistered** during the academic year, by cycle and program, per faculty.
- **[SRC-054]** List of students who **suspended** their studies in the academic year.
- **[SRC-055]** Curriculum plan with credits and **syllabi** for each program for each academic year … Department/Faculty. *(Purpose: students ask for the plan and syllabi at different times for other purposes — further studies, employment, etc.)*
- **[SRC-056]** Name-list report of students including credits, grades received and attendance.
- **[SRC-057]** List of **backlog students** with general contact information, so they can be contacted / messaged and notified about sessions and academic and financial obligations.
- **[SRC-058]** List of students taking exams in autumn, per course, for the **first time and/or as a retake**.

### Diploma module

**[SRC-059]** The **diploma module** generates diplomas and **diploma supplements** in the format approved by Kolegji Universitar LOGOS and the **MAS** *(Ministry of Education and Sport)*. The diploma and supplement are generated **automatically** after the student's academic and financial obligations are closed and their status changes from **active student** to **graduated**.

## Human Resources

**[SRC-060]** Lecturer management module, administering lecturers in two major categories:
- full-time, internal (**PAE**),
- part-time, external (**PAK**).

**[SRC-061]** A **lecturer attendance list** can be kept here, and the system automatically produces the list of academic staff whose engagement has **ended according to the contract end date**, which is set when the person is hired.

**[SRC-062]** This module is also linked to the **standard employment contract** template for academic and administrative staff, filling in general data (specifically degree/title, gender and age) and employment data entered from day 1 of employment.

### Information from HR accessible to the Finance Office

- **[SRC-063]** List of internal and external lecturers by department, faculty and semester, including qualifications — degree and title.
- **[SRC-064]** List of lecturers by title and degree, gender and age.
- **[SRC-065]** Lecturer **performance evaluation form** (evaluation by the head of department) — HR.
- *[A "Department" heading appears here in the original; the following items seem to belong to Department / HR / Finance.]*
- **[SRC-066]** Record of **hours delivered** by external and internal lecturers for each month and semester, for each course or group of courses.
- **[SRC-067]** List of external lecturers and information about their **primary employment** — Finance Office.
- **[SRC-068]** List of **retired** external lecturers.
- **[SRC-069]** List of **volunteer** lecturers by department, faculty, semester and study program.
- **[SRC-070]** **Online access for lecturers**: viewing grades, absences, etc.
- **[SRC-071]** Reports on the **performance level** of academic staff at department, faculty and institution level, based on the evaluation form.
- **[SRC-072]** Operational report — **entry/exit** of internal and guest lecturers at LOGOS, linked to the institution's access-control system.

## Financial module

**[SRC-080]** The financial module, which uses the **F5** system, administers the whole financial process:
- **[SRC-080a]** students' payments of tuition fees, administrative fees, diploma fees, backlog exams, etc.,
- **[SRC-080b]** payment of academic and assistant-academic staff,
- **[SRC-080c]** possibly also the teaching load delivered by lecturers paid by the hour, and payment supplements for staff.

**[SRC-081]** Additional information: the Finance Office uses the **Financa 5** program. A link between this module and that program, to avoid entering student and lecturer data twice, would be effective.

**[SRC-082]** **Reports**: the system generates academic, administrative and financial reports by combining different attributes.

### Finance — for students

- **[SRC-083]** List of students with **full or partial scholarships** — the system generates the list of students with their respective fees.
- **[SRC-084]** Report on the number of scholarships per academic year and per study program.
- **[SRC-085]** List of students grouped by **payment deadlines** according to the annex of the student contract, since payments are made in **installments**.
- **[SRC-086]** **Automatic messages** to students reminding them of the contract deadline for the next payment (**two weeks before each installment**).
- **[SRC-087]** (The same list accessible at the same time by Finance and the Secretariat.) *[Appears twice in the original, attached to empty bullets — interpreted as: payment lists are shared between Finance and Secretariat.]*
- **[SRC-088]** List of backlog students / students completing their studies in the academic year.

## Library

**[SRC-100]** Uses the **PLEJADES** system.

- **[SRC-101]** List of books in the library / online library, etc.
- **[SRC-102]** Opening a **library card** online.
- **[SRC-103]** List of students who use the online library.
- **[SRC-104]** List of users who have / have not closed their **obligations with the library**, etc.

## Department

- **[SRC-110]** Curriculum plan, syllabi.
- **[SRC-111]** Diploma form and supplement **approved for the current academic year** — accessible, besides the department, by the Secretariat, the administrator, the program coordinator, etc.
- **[SRC-112]** Curriculum plan, syllabi, diploma and supplement **approved in past years**. *[The original repeats "Plan, syllabi" — interpreted as the archive of past years.]*
- **[SRC-113]** Annual **teaching load** of internal and external lecturers, by semester.
- **[SRC-114]** **Standardized formats** for academic processes (admission, registration, **ranking of candidates** by cycle and category); on the website.

## NJSBC (Internal Quality Assurance Unit)

- **[SRC-120]** Lecturer evaluation form filled by students.
- **[SRC-121]** Administration evaluation form filled by students. *(Can be merged into one form with the lecturer evaluation.)*
- **[SRC-122]** Tracking of **ALUMNI** progress.
- **[SRC-123]** Staff quality. *[No further detail in the original.]*

## Erasmus Office

- **[SRC-130]** Erasmus form — administrative staff.
- **[SRC-131]** Erasmus form — academic staff.
- **[SRC-132]** Erasmus form — student.
- **[SRC-133]** The forms live on the website, while applicants' data flow into the system.

## Administration

- **[SRC-140]** Forms for: **leave**, **office supplies**, **certificates**, **authorizations**, etc.
- **[SRC-141]** Staff performance evaluation form, filled by the **direct supervisor**.

## Data security *(written in English in the original)*

- **[SRC-150]** How can this data be safely stored — how can the institution maintain backups in soft copy (storing personal data in the US is suspected to be illegal in Europe)?
- **[SRC-151]** Are the data fully convertible to standard programmes, facilitating data migration?
- **[SRC-152]** What are the personal data protection protocols, and are they compatible with the Albanian personal data protection legal framework?
