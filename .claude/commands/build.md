---
description: Implement a specced feature task by task
argument-hint: <FEATURE-ID>
---

Implement feature **$ARGUMENTS** from its spec.

1. **Gate.** Run `node scripts/features.mjs`. Continue only if the feature is 🟢 ready and its
   Status is `specced` or `in-progress`. Otherwise stop and explain (missing spec → `/spec`,
   dependency not done, or blocked by a question).
2. **Read** the spec completely, plus `CLAUDE.md` and `docs/02-architecture/conventions.md`, and the
   code of the modules it depends on.
3. **Start.** Create or switch to branch `feat/<ID>-<slug>`. Set Status `in-progress` in FEATURES.md.
4. **Implement the tasks in order.** For each task:
   - write the code and its tests (the test plan names them);
   - run the relevant tests until they pass;
   - tick the task's checkbox in the spec;
   - commit as `<ID>: T<n> <summary>`.
5. **If reality disagrees with the spec** (a library API differs, a rule is missing, a design
   doesn't work), stop and tell the user. Update the spec, and the open questions if needed, before
   continuing. Never guess a business rule.
6. **Finish.** Run `pnpm lint && pnpm typecheck && pnpm test` (and `pnpm test:e2e` for user-facing
   features). Go through the spec's Definition of Done. Update the docs it lists. Set Status `done`
   and run `node scripts/features.mjs --write`.
7. **Report:** what was built, how to try it (URL, dev login), what tests cover it, and which
   features are now ready.
