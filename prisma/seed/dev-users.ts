import { readFileSync } from "node:fs";
import type { Seeder } from "./types";

type DevUser = { role: string; email: string; name: string; appUser: boolean; active?: boolean };

// Same file the Keycloak dev-user script reads, so both sides cannot drift. Role assignments come
// with PLT-05 (UserRole); until then these rows only let the person sign in.
const file = new URL("../../infra/keycloak/dev/dev-users.json", import.meta.url);

export const devUsersSeeder: Seeder = {
  name: "dev-users",
  envs: ["dev"],
  async run(db) {
    const { users } = JSON.parse(readFileSync(file, "utf8")) as { users: DevUser[] };
    for (const u of users.filter((u) => u.appUser)) {
      await db.user.upsert({
        where: { email: u.email },
        // emailVerified=false on purpose: the first login must link the Keycloak `sub` by email.
        create: { email: u.email, name: u.name, active: u.active ?? true },
        // Keep what first login linked; only restore the dev-defined activity flag.
        update: { name: u.name, active: u.active ?? true },
      });
    }
  },
};
