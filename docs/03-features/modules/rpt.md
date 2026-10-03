# RPT — Reporting

Code: `src/modules/rpt`. Most fixed lists live in their own module (via PLT-10); this module adds
cross-module, ad-hoc reporting.

### RPT-01 — Combined report builder
- **Goal:** academic, administrative and financial reports built by combining attributes (SRC-082).
- **Users:** management, secretary, finance, hr, quality (each limited to data their roles allow).
- **Scope:** curated datasets (students, enrollments, results, payments, staff, assignments) exposed
  as read-only SQL views; builder UI: choose dataset, columns, filters, group-by, aggregates (count,
  sum, avg); save and share report definitions; schedule a report by email (PLT-12); export Excel.
- **Rules:** datasets apply the same scope filters as the source modules; row-level permissions
  can't be bypassed through the builder.
