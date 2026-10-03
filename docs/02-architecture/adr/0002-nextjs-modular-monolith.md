# ADR-0002 — Next.js modular monolith

- **Status:** Accepted (2026-10-03)

## Context

The client asked for Next.js + PostgreSQL. The system has many modules that share data heavily
(students, programs, grades, payments). The team is small.

## Decision

- **One** Next.js application (App Router, TypeScript strict, React Server Components) that serves
  the UI and the server logic (server actions + a few route handlers). No separate backend service.
- Internally split into **modules** (`src/modules/<module>`) with explicit public APIs
  (`index.ts`), mirroring the feature registry prefixes.
- UI: Tailwind CSS + shadcn/ui; forms with React Hook Form + Zod; tables with TanStack Table.

## Consequences

- One deployable, one database, transactions across modules are trivial.
- Discipline is needed to keep module boundaries (lint rule restricting cross-module deep imports).
- If an external consumer (e.g. a mobile app) appears later, add versioned route handlers or extract
  a service — module boundaries make that feasible.

## Alternatives considered

- Next.js frontend + separate NestJS/Express API — more moving parts, duplicated types, no benefit
  at this scale.
- Microservices — far too heavy.
