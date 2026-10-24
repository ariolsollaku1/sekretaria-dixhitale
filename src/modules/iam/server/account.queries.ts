import "server-only";
import { db } from "@/lib/db";
import { accountState, type AccountState } from "../domain/account-rules";

export type AccountPanelData = { state: AccountState; email: string | null };

/** AC-9: the state of a person's account for the student and staff pages. */
export async function getAccountPanel(personId: string): Promise<AccountPanelData> {
  const [user, person] = await Promise.all([
    db.user.findUnique({
      where: { personId },
      select: { active: true, lastLoginAt: true, email: true },
    }),
    db.person.findUnique({ where: { id: personId }, select: { email: true } }),
  ]);
  return { state: accountState(user), email: user?.email ?? person?.email ?? null };
}
