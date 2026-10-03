---
description: Show which features are ready to build and recommend the next one
---

Recommend what to work on next in this project.

1. Run `node scripts/features.mjs` and read its output (ready, waiting, blocked, question impact).
2. From the 🟢 ready features, recommend **one**: the earliest phase first; within a phase, the one
   with the most dependents (it unblocks the most). Say why in one sentence.
   - Status `todo` → suggest `/spec <ID>`.
   - Status `specced` → suggest `/build <ID>`.
   - Status `in-progress` → say it's already in progress and what's left (unticked tasks in its spec).
3. List the other ready features (one line each).
4. Show the top 3 open **blocking** questions by impact, and which questions
   [docs/05-roadmap.md](../../docs/05-roadmap.md) says to ask before the **next** phase.

Keep the answer short: a recommendation, a list, and the questions. Don't start any work.
