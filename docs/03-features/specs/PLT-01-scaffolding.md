# PLT-01 — Project scaffolding

| | |
|---|---|
| **Phase** | P0 |
| **Depends on** | — |
| **Questions** | — |
| **Source** | — (enabler for everything) |
| **Brief** | [../modules/plt.md](../modules/plt.md) |

## 1. Context

Empty repository with documentation only. This feature creates the Next.js application skeleton,
tooling and CI so that every later feature only adds code in the agreed places
([overview.md](../../02-architecture/overview.md), [conventions.md](../../02-architecture/conventions.md)).

## 2. Requirements

### User stories

- As a **developer (or Claude Code)**, I want a working, opinionated project skeleton, so that
  every feature lands in a predictable place and is checked automatically.

### Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | WHEN a developer runs `pnpm install` and `pnpm dev` with a valid `.env`, THE SYSTEM SHALL serve a placeholder home page at `APP_URL`. |
| AC-2 | THE SYSTEM SHALL provide scripts `lint`, `format`, `typecheck`, `test` (unit), `test:e2e`, `build`, `start`, all passing on the skeleton. |
| AC-3 | WHEN `GET /api/health` is called, THE SYSTEM SHALL return `200` with JSON `{ status: "ok", version, time }`. |
| AC-4 | IF a required environment variable is missing or malformed at startup, THEN THE SYSTEM SHALL fail fast with a message naming the variable. |
| AC-5 | THE SYSTEM SHALL have the folder structure of overview.md (`src/app/(public)`, `src/app/(app)`, `src/app/api`, `src/modules`, `src/lib`, `src/components/ui`, `prisma/`, `infra/`, `messages/`). |
| AC-6 | IF code imports a module's internals from another module (anything but `@/modules/<m>` / its `index.ts`), THEN `pnpm lint` SHALL fail. |
| AC-7 | WHEN code is pushed or a PR is opened, CI SHALL run lint, typecheck, unit tests, build and `node scripts/features.mjs --check`. |
| AC-8 | THE SYSTEM SHALL use TypeScript `strict` and `noUncheckedIndexedAccess`, and the `@/` path alias for `src/`. |

### Out of scope

Docker (PLT-02), database (PLT-03), auth (PLT-04), UI kit and i18n (PLT-06).

## 3. Design

- `create-next-app` with: TypeScript, App Router, `src/` dir, Tailwind, ESLint, import alias `@/*`,
  **pnpm**. Remove demo content.
- `next.config.ts`: `output: "standalone"`, `poweredByHeader: false`, strict mode.
- **Env validation:** `src/lib/env.ts` parses `process.env` with Zod into a typed `env` object;
  server-only (import `server-only`). Variables for later features are added by those features.
  `.env.example` documents each variable with a comment.
- **Lint:** ESLint flat config (Next + TypeScript recommended + `eslint-plugin-boundaries` or an
  equivalent rule set enforcing module boundaries); Prettier with `prettier-plugin-tailwindcss`.
- **Tests:** Vitest (`vitest.config.ts`, project `unit` for `**/*.test.ts`; project `integration`
  is added by PLT-03); Playwright (`playwright.config.ts`, `e2e/` folder, base URL from env, one
  smoke test).
- **Health:** `src/app/api/health/route.ts` — no auth, no caching; `version` from `package.json`
  (PLT-03 adds a DB check).
- **Placeholders:** `src/modules/README.md` (module layout: `domain/`, `server/`, `ui/`,
  `index.ts`), `messages/en.json` & `messages/sq.json` as `{}`, `infra/README.md`.
- **CI:** `.github/workflows/ci.yml` — Node LTS, pnpm cache, `pnpm install --frozen-lockfile`, lint,
  typecheck, test, build, `node scripts/features.mjs --check`.
- Repo hygiene: `.gitignore` (node, next, env, coverage, playwright reports, `.DS_Store`),
  `.editorconfig`, `.nvmrc` (current Node LTS, ≥ 22), root `README.md` quickstart.

## 4. Tasks

- [x] **T1** — Generate the Next.js app (pnpm, TS, App Router, src dir, Tailwind, ESLint, `@/*`),
      remove boilerplate, placeholder home page. (AC-1)
- [x] **T2** — tsconfig strict + `noUncheckedIndexedAccess`; Prettier; ESLint flat config incl.
      module-boundary rule (core `no-restricted-imports`, see Deviations) + a test fixture proving a forbidden import fails. (AC-6, AC-8)
- [x] **T3** — `src/lib/env.ts` with Zod + `.env.example`; unit test for missing/malformed vars. (AC-4)
- [x] **T4** — Folder skeleton and READMEs from AC-5. (AC-5)
- [x] **T5** — `/api/health` route + unit test. (AC-3)
- [x] **T6** — Vitest setup + Playwright setup with smoke E2E (home page renders). (AC-2)
- [x] **T7** — `package.json` scripts; CI workflow. (AC-2, AC-7)
- [x] **T8** — Root `README.md` quickstart; update the "Commands" section of `CLAUDE.md` if any
      command differs from what's documented there.

### Deviations (recorded during build)

- **TypeScript 6, ESLint 9:** at build time `typescript-eslint` did not support TypeScript 7 and
  `eslint-plugin-react` (via `eslint-config-next`) did not support ESLint 10, so `typescript@^6`
  and `eslint@^9` are pinned. Revisit when those plugins catch up.
- **Module boundaries** are enforced with ESLint core `no-restricted-imports` (`@/modules/*/*`)
  instead of `eslint-plugin-boundaries`, whose v7 API was in flux; the spec allows an equivalent.
  Inside a module, code uses relative imports, so any alias deep path is a violation.
- `src/lib/parse-env.ts` holds the pure `parseEnv`; `src/lib/env.ts` (`server-only`) exports the
  validated `env`, loaded at startup from `src/instrumentation.ts`.
- Playwright's dev server follows the port in `APP_URL`.

## 5. Test plan

| AC | Type | Test |
|---|---|---|
| AC-1 | e2e | `e2e/smoke.spec.ts` loads `/` and sees the placeholder heading |
| AC-3 | unit | health route handler returns 200 and the expected shape |
| AC-4 | unit | `parseEnv` throws naming the variable for missing / invalid input |
| AC-6 | lint | `pnpm lint` fails on a fixture with a cross-module deep import (fixture excluded from normal lint run, checked by a dedicated test script) |
| AC-2, AC-7 | CI | pipeline green on the skeleton |

## 6. Definition of done

- [x] All tasks ticked, ACs covered
- [ ] CI green
- [ ] FEATURES.md Status → `done`; `node scripts/features.mjs --write`
