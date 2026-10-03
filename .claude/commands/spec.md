---
description: Write the full spec (requirements, design, tasks) for a feature
argument-hint: <FEATURE-ID>
---

Write the full specification for feature **$ARGUMENTS**.

1. **Check readiness.** Find the feature in `docs/03-features/FEATURES.md` and run
   `node scripts/features.mjs`. If it is 🔴 blocked or 🟠 blocked-dep, stop: explain which open
   questions block it and what answers are needed. If it is 🟡 waiting, you may continue, but say
   which dependencies aren't built yet.
2. **Read before writing:**
   - its brief in `docs/03-features/modules/<prefix>.md`;
   - every `SRC-xxx` it cites in `docs/00-source/requirements-en.md` (check
     `requirements-sq.md` when wording is ambiguous — the Albanian original wins);
   - the related questions and their answers/findings in `docs/04-open-questions.md`;
   - `docs/01-product/roles.md`, `glossary.md`, `docs/02-architecture/domain-model.md`,
     `conventions.md`, `auth.md`, and relevant ADRs;
   - the specs of its dependencies and, for dependencies already built, their actual code.
3. **Write** `docs/03-features/specs/<ID>-<short-slug>.md` from `specs/_template.md`. Fill every
   section:
   - acceptance criteria in EARS form, each one testable, numbered AC-n;
   - data model as a Prisma sketch following conventions; permissions; actions, queries and domain
     rules; routes and UI; edge cases;
   - small ordered tasks that reference ACs; a test plan that covers every AC.
4. **Don't invent business rules.** If the spec needs a rule nobody has given (grading, fees,
   formats, deadlines…), add or extend a question in `docs/04-open-questions.md` (Blocking `yes` if
   the feature can't be correct without it, otherwise `no` with a documented working assumption).
   If it's blocking, stop and tell the user.
5. **Update the docs:** in FEATURES.md, set the Spec link and Status `specced`; update
   `domain-model.md` if entities change; then run `node scripts/features.mjs --write`.
6. **Hand over for review:** summarize the key decisions, the assumptions and anything the user
   should confirm. Don't start implementing.
