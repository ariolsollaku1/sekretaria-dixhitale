# ADR-0001 — Spec-driven documentation for AI-assisted development

- **Status:** Accepted (2026-10-03)

## Context

The system is large (~75 features across ~20 modules), the requirements are written in Albanian
and partly ambiguous, several external systems are involved, and implementation will be done with
Claude Code. AI coding agents work best when each task has a precise, self-contained spec and when
unknowns are explicit instead of guessed.

Frameworks reviewed (October 2026): GitHub **Spec Kit** (constitution → spec → plan → tasks),
AWS **Kiro** (requirements in EARS notation → design → tasks, plus steering files), **BMAD-METHOD**
(multi-agent PRD/architecture/stories), **OpenSpec** (change proposals against existing specs),
**Task Master AI** (PRD → dependency-aware task list), and **CLAUDE.md / AGENTS.md** instruction
files.

## Decision

Use a **tool-agnostic, Markdown-only** structure that borrows the best parts of each:

| Borrowed from | What |
|---|---|
| Spec Kit | Project-wide rules (our `CLAUDE.md` + `docs/02-architecture/conventions.md` act as the "constitution"); spec → plan → tasks per feature |
| Kiro | **EARS** acceptance criteria (`WHEN … THE SYSTEM SHALL …`); steering = `CLAUDE.md` |
| Task Master | Feature registry with explicit **dependencies** and computed readiness |
| ADR practice | Decisions recorded in `docs/02-architecture/adr/` |

Concretely:
- `docs/00-source/` — original requirements + English translation with stable `SRC-xxx` IDs.
- `docs/03-features/FEATURES.md` — registry: every feature with phase, status, dependencies,
  blocking questions, source IDs. Readiness is **computed** by `scripts/features.mjs`.
- `docs/03-features/modules/*.md` — a short brief for every feature.
- `docs/03-features/specs/<ID>-<slug>.md` — full spec (requirements + design + tasks) written
  **just before** a feature is built, from `specs/_template.md`.
- `docs/04-open-questions.md` — every unknown, whether it blocks, and which features it blocks.
- `.claude/commands/` — `/next`, `/spec`, `/build`, `/answer` to run the workflow.

## Consequences

- No CLI or vendor dependency; any agent or human can follow it.
- Specs are written just-in-time, so they use the latest answers and code reality.
- The registry must be kept up to date — enforced by `node scripts/features.mjs --check` in CI.

## Alternatives considered

- **Install Spec Kit as-is** — good, but its per-feature folders don't track cross-feature
  dependencies/blockers, which is the main planning need here.
- **BMAD** — too heavy (many agent personas) for a team of one or two plus Claude Code.
- **OpenSpec** — designed for changing an existing system; revisit after v1 for maintenance work.
