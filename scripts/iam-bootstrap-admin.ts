// AC-12: pnpm iam:bootstrap-admin --email <e> --first <f> --last <l>
// Run with `tsx --conditions=react-server` (see package.json) so `server-only` imports resolve.
import { parseArgs } from "node:util";
import { PrismaClient } from "../src/generated/prisma/client";
import { createAdapter } from "../src/lib/db/adapter";
import { parseEnv } from "../src/lib/parse-env";
import { bootstrapAdmin } from "../src/modules/iam/server/bootstrap";
import { KeycloakAdmin } from "../src/modules/iam/server/keycloak-admin";
import { realmFromIssuer } from "../src/modules/iam/server/realm";

const { values } = parseArgs({ options: { email: { type: "string" }, first: { type: "string" }, last: { type: "string" } } });
if (!values.email || !values.first || !values.last) {
  console.error("Usage: pnpm iam:bootstrap-admin --email <email> --first <first name> --last <last name>");
  process.exit(2);
}

const env = parseEnv(process.env);
const db = new PrismaClient({ adapter: createAdapter(env.DATABASE_URL) });
const idp = new KeycloakAdmin({
  baseUrl: env.KEYCLOAK_INTERNAL_URL ?? new URL(env.KEYCLOAK_ISSUER).origin,
  realm: realmFromIssuer(env.KEYCLOAK_ISSUER),
  clientId: env.KEYCLOAK_ADMIN_CLIENT_ID,
  clientSecret: env.KEYCLOAK_ADMIN_CLIENT_SECRET,
  appClientId: env.KEYCLOAK_CLIENT_ID,
  appRedirectUri: `${env.APP_URL}/login`,
});

try {
  const result = await db.$transaction((tx) => bootstrapAdmin(tx, idp, { email: values.email!, firstName: values.first!, lastName: values.last! }));
  console.log(`System administrator ready (user ${result.userId}, identity ${result.identity}).`);
  console.log(
    result.activationEmailSent
      ? "Next step: open the email Keycloak just sent to that address, set the password and a one-time-code authenticator, then sign in."
      : "Next step: sign in with the existing Keycloak account; you will be asked to set up a one-time-code authenticator.",
  );
} catch (error) {
  console.error("Bootstrap failed:", (error as Error).message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
