# Modules

One folder per module (`org`, `cur`, `stu`, …), each laid out as:

```
<module>/
  domain/   pure types, Zod schemas and business rules (no I/O) — unit tested
  server/   services, queries, server actions (only place that touches Prisma)
  ui/       module-specific React components
  index.ts  public API; other modules may import only from here
```

Rules: [docs/02-architecture/conventions.md](../../docs/02-architecture/conventions.md).
