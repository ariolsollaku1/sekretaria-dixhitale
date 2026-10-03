---
description: Record a client answer to an open question and propagate it through the docs
argument-hint: <Q-ID> <answer text>
---

Record this answer: **$ARGUMENTS**

1. Find the question in `docs/04-open-questions.md`. Under **Answer**, write the answer with
   today's date, in clear English (translate it if the user wrote Albanian, keeping official terms).
   If it only partly answers the question, keep Status `open` and say what's still missing.
   Otherwise set Status `answered` in the summary table.
2. **Propagate** wherever the answer changes something:
   - module briefs (`docs/03-features/modules/*.md`) and any specs of affected features;
   - `domain-model.md`, `roles.md`, `auth.md`, `deployment.md`, or a **new ADR** if an architecture
     decision changes;
   - FEATURES.md: if the answer adds scope, add features (new IDs, phase, dependencies, source).
     If it removes scope, mark the feature as dropped in its brief and remove its row.
3. Run `node scripts/features.mjs --write`.
4. Report briefly: what changed in the docs, which features became unblocked, and any follow-up
   questions the answer raised (add those to the questions file too).
