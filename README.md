# Sekretari Dixhitale

The digital academic administration system for **Kolegji Universitar LOGOS**: Next.js +
PostgreSQL, Keycloak for authentication, deployed with Docker.

## Quickstart

Requires Node >= 22 (`.nvmrc`) and pnpm (`corepack enable`).

```bash
pnpm install
cp .env.example .env     # then adjust values
pnpm dev                 # http://localhost:3000 (health: /api/health)
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e            # first time: pnpm exec playwright install chromium
```

Docker stack (Postgres, Keycloak, …), database and auth arrive with PLT-02…04.

## Documentation

The project is built spec-first. Start here:

- [docs/README.md](docs/README.md) — documentation map
- [docs/03-features/FEATURES.md](docs/03-features/FEATURES.md) — what will be built, what's ready, what's blocked
- [docs/04-open-questions.md](docs/04-open-questions.md) — what we still need from LOGOS
- [docs/05-roadmap.md](docs/05-roadmap.md) — build phases

Feature status at any time: `node scripts/features.mjs`.
