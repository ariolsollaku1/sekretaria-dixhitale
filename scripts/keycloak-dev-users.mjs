// Dev only: creates the users from infra/keycloak/dev/dev-users.json in realm `logos` through
// Keycloak's partial-import API (existing users are skipped, so this is idempotent). Production
// realms never get these users because only `pnpm infra:up` runs this script.
import { readFileSync } from "node:fs";

try {
  process.loadEnvFile(".env");
} catch {
  // rely on the real environment
}

const base = `http://127.0.0.1:${process.env.KEYCLOAK_PORT ?? "8080"}`;
const { password, users } = JSON.parse(
  readFileSync(new URL("../infra/keycloak/dev/dev-users.json", import.meta.url), "utf8"),
);

async function json(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const { access_token: token } = await json(`${base}/realms/master/protocol/openid-connect/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: process.env.KC_BOOTSTRAP_ADMIN_USERNAME ?? "admin",
    password: process.env.KC_BOOTSTRAP_ADMIN_PASSWORD ?? "",
  }),
});


const result = await json(`${base}/admin/realms/logos/partialImport`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({
    ifResourceExists: "SKIP",
    users: users.map((u) => {
      const [firstName, ...rest] = u.name.split(" ");
      return {
        username: u.email,
        email: u.email,
        emailVerified: true,
        enabled: true,
        firstName,
        lastName: rest.join(" "),
        // sysadmin must use a second factor (Q-18) even in dev, to exercise the OTP flow.
        groups: u.role === "sysadmin" && process.env.DEV_SYSADMIN_OTP === "true" ? ["/require-otp"] : [],
        credentials: [{ type: "password", value: password, temporary: false }],
      };
    }),
  }),
});
console.log(`keycloak dev users: ${result.added} added, ${result.skipped} skipped`);
