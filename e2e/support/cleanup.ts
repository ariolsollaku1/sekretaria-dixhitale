import pg from "pg";

/** Removes e2e-created users (`<prefix>%@dev.logos.test`) from the app database and from Keycloak. */
export async function deleteTestUsers(prefix: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("delete from users where email like $1", [`${prefix}%@dev.logos.test`]);
  } finally {
    await client.end();
  }

  const base = new URL(process.env.KEYCLOAK_ISSUER!).origin;
  const token = await fetch(`${base}/realms/logos/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "sekretari-admin",
      client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET!,
    }),
  }).then((r) => r.json() as Promise<{ access_token: string }>);
  const headers = { authorization: `Bearer ${token.access_token}` };
  const found = (await fetch(
    `${base}/admin/realms/logos/users?search=${encodeURIComponent(prefix)}&max=200`,
    { headers },
  ).then((r) => r.json())) as { id: string; email?: string }[];
  for (const u of found) {
    if (u.email?.startsWith(prefix))
      await fetch(`${base}/admin/realms/logos/users/${u.id}`, { method: "DELETE", headers });
  }
}
