# Sekretari Dixhitale — LOGOS University College

Web-based academic administration system ("digital secretariat") for **Kolegji Universitar LOGOS**
(Albania): students from application to diploma, curriculum, exams and grades, certificates,
finance, HR, library, quality assurance, Erasmus, administration.

**Stack:** Next.js (App Router, TypeScript strict) · PostgreSQL + Prisma · Keycloak (OIDC) via
Better Auth · Docker Compose · Gotenberg (PDF) · pg-boss (jobs) · next-intl (`sq` default, `en`) ·
Tailwind + shadcn/ui · Vitest + Playwright · pnpm.

## Where things are

| Path | What |
|---|---|
| [docs/README.md](docs/README.md) | Map of the documentation |
| `docs/00-source/` | Original requirements (Albanian `.docx` + transcript) and English translation with stable `SRC-xxx` IDs. **The Albanian original wins** on any disagreement. |
| `docs/01-product/` | Vision, roles & access matrix, glossary (use its "Code name" column for identifiers) |
| `docs/02-architecture/` | Overview, auth, deployment, domain model, **conventions**, ADRs |
| `docs/03-features/FEATURES.md` | **Feature registry — source of truth** for status, dependencies, blockers |
| `docs/03-features/modules/*.md` | Short brief of every feature, per module |
| `docs/03-features/specs/*.md` | Full specs (requirements in EARS + design + tasks); `_template.md` |
| `docs/04-open-questions.md` | Every unknown; `Blocking: yes` + `open` blocks features |
| `docs/05-roadmap.md` | Phases P0–P8 and why |
| `scripts/features.mjs` | Validates the registry and computes readiness |

## Workflow (spec-driven — ADR-0001)

1. `/next` — see what is 🟢 ready and pick the next feature.
2. `/spec <ID>` — write the full spec from the template; the user reviews it.
3. `/build <ID>` — implement task by task against the spec.
4. `/answer Q-xx <answer>` — record a client answer and propagate it.

Rules:
- **Only build features whose readiness is 🟢 ready.** Speccing a 🟡 waiting feature is fine; never
  build or spec around a 🔴/🟠 blocker.
- **Never invent business rules** (grading, eligibility, fees, document layouts, numbering,
  retention…). If a rule is missing, add or extend a question in `docs/04-open-questions.md`, mark
  it blocking if it is, and ask the user.
- Keep docs in sync **in the same change**: FEATURES.md status, spec task checkboxes,
  `domain-model.md` when entities change, a new ADR when a decision changes (supersede, don't
  rewrite history).
- After editing FEATURES.md or the questions file run `node scripts/features.mjs --write`;
  CI runs `--check`.
- Cite requirement IDs: specs list their `SRC-xxx`; code comments cite them where a rule comes from
  the source (`// SRC-086: remind two weeks before each installment`).

## Engineering rules (summary — full list in docs/02-architecture/conventions.md)

- Modular monolith: `src/modules/<module>/{domain,server,ui}` + `index.ts`. Other modules import
  only from `index.ts`. `domain/` is pure (no I/O) and unit-tested.
- Every mutation is a server action through the shared wrapper: **permission check → Zod → transaction
  → audit**. Every list query applies the user's scope filter. The UI is never the security boundary.
- No hard deletes of business data. Money `Decimal(12,2)`. Timestamps UTC, displayed in `Europe/Tirane`.
- All UI text through next-intl; the `sq` catalog must be complete.
- No personal data in logs (ids only).
- Tests: unit for domain rules, integration against real Postgres for services and permissions,
  Playwright for the main flow + one forbidden case. A feature is done only when its ACs are tested
  and `pnpm lint && pnpm typecheck && pnpm test` pass.
- Libraries change fast (Next.js, Better Auth, Prisma, Keycloak): **check current docs** instead of
  relying on memory, and record deviations in the spec/ADR.

## Commands

Available once PLT-01…03 are built (update this list if they change):

```bash
pnpm infra:up | infra:down | infra:reset   # Postgres, Keycloak, Gotenberg, Mailpit (Docker)
pnpm dev                                    # app on http://localhost:3100
pnpm lint && pnpm typecheck && pnpm test    # must pass before a feature is done
pnpm test:e2e                               # Playwright
pnpm db:migrate | db:deploy | db:seed | db:reset | db:studio   # Prisma 7 (prisma.config.ts)
pnpm test:unit | test:int                   # Vitest projects (integration needs infra:up)
node scripts/features.mjs [--write|--check|--ready]
```

## Language & git

- Docs, code, identifiers, commit messages: **English**. UI default **Albanian** (Q-17).
- Branch `feat/<ID>-<slug>`; commit messages `<ID>: <imperative summary>`; one feature per PR.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
