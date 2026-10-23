// Warm the dev server so the first Keycloak callback does not race route compilation.
export default async function globalSetup() {
  const base = process.env.APP_URL ?? "http://localhost:3100";
  for (const path of ["/api/auth/ok", "/login", "/api/health"]) {
    await fetch(`${base}${path}`).catch(() => undefined);
  }
}
