// CUR-06 (Q-117): the default cover and plan table of the study package, per language. A starting
// point only: the sysadmin edits and publishes the real template in the document admin (PLT-09).
// Pure data so the seeder and the tests can import it.

const STYLE = `<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; }
  h1 { font-size: 17pt; margin: 0 0 4mm; }
  h2 { font-size: 11.5pt; margin: 7mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 1.4mm 2mm; text-align: left; vertical-align: top; }
  th { background: #eee; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  .meta td { border: 0; padding: 0.6mm 2mm 0.6mm 0; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8mm; }
  .qr svg { width: 24mm; height: 24mm; }
  .muted { color: #555; font-size: 9pt; }
</style>`;

const body = (l: {
  title: string;
  program: string;
  student: string;
  cohort: string;
  plan: string;
  semester: string;
  code: string;
  course: string;
  credits: string;
  hours: string;
  elective: string;
  syllabus: string;
  yes: string;
  no: string;
  total: string;
  summary: string;
  missing: string;
  number: string;
  issued: string;
  verify: string;
}) => `<!doctype html>
<html><head><meta charset="utf-8">${STYLE}</head><body>
<h1>${l.title}</h1>
<table class="meta">
  <tr><td>${l.program}</td><td><b>{{program.code}} — {{program.name}}</b></td></tr>
  <tr><td>${l.student}</td><td><b>{{student.name}}</b> ({{student.number}})</td></tr>
  <tr><td>${l.cohort}</td><td>{{cohort}}</td></tr>
  <tr><td>${l.plan}</td><td>v{{planVersion}} ({{planFrom}})</td></tr>
</table>
{{#each semesters}}
<h2>${l.semester} {{label}} — {{credits}} ${l.credits}</h2>
<table>
  <tr><th>${l.code}</th><th>${l.course}</th><th class="n">${l.credits}</th><th>${l.hours}</th><th>${l.syllabus}</th></tr>
  {{#each courses}}
  <tr>
    <td>{{code}}</td>
    <td>{{name}}{{#if elective}} (${l.elective}){{/if}}</td>
    <td class="n">{{credits}}</td>
    <td>{{hours}}</td>
    <td>{{#if hasSyllabus}}${l.yes}{{/if}}{{#if noSyllabus}}${l.no}{{/if}}</td>
  </tr>
  {{/each}}
</table>
{{/each}}
<h2>${l.total}: {{totalCredits}} ${l.credits}</h2>
<p>${l.summary}</p>
{{#if hasMissing}}<p class="muted">${l.missing}</p>{{/if}}
<div class="foot">
  <div class="muted">${l.number} {{number}}<br>${l.issued} {{issuedDate}}<br>${l.verify} {{verifyUrl}}</div>
  <div class="qr">{{{qr}}}</div>
</div>
</body></html>`;

export const DEFAULT_PACKAGE_TEMPLATES: Record<"sq" | "en", string> = {
  sq: body({
    title: "Plani mësimor me kredite dhe syllabuset",
    program: "Programi i studimit",
    student: "Studenti",
    cohort: "Kohorti",
    plan: "Versioni i planit",
    semester: "Viti.semestri",
    code: "Kodi",
    course: "Lënda",
    credits: "kredite",
    hours: "Orë L/S/Lab",
    elective: "me zgjedhje",
    syllabus: "Syllabus",
    yes: "Bashkëlidhur",
    no: "Mungon",
    total: "Totali",
    summary:
      "Syllabuset e bashkëlidhura ndjekin këtë faqe sipas radhës së planit: {{syllabusCount}} nga {{courseCount}} lëndë.",
    missing:
      "Për {{missingCount}} lëndë nuk ka syllabus të miratuar ose skedari nuk është i lexueshëm.",
    number: "Numri i dokumentit:",
    issued: "Data e lëshimit:",
    verify: "Verifikimi:",
  }),
  en: body({
    title: "Curriculum plan with credits and syllabi",
    program: "Study program",
    student: "Student",
    cohort: "Cohort",
    plan: "Plan version",
    semester: "Year.semester",
    code: "Code",
    course: "Course",
    credits: "credits",
    hours: "Hours L/S/Lab",
    elective: "elective",
    syllabus: "Syllabus",
    yes: "Attached",
    no: "Missing",
    total: "Total",
    summary:
      "The attached syllabi follow this page in plan order: {{syllabusCount}} of {{courseCount}} courses.",
    missing: "{{missingCount}} courses have no approved syllabus, or its file is not readable.",
    number: "Document number:",
    issued: "Issue date:",
    verify: "Verification:",
  }),
};
