import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Actor, Assignment } from "./types";

export type ActorContext = { actor: Actor; assignments: Assignment[] };

/**
 * Loads the user's active flag and all role rows. `cache()` memoizes within ONE request only, so
 * a role change applies on the user's next request (AC-8); nothing is cached across requests.
 */
export const loadActorContext = cache(async (userId: string): Promise<ActorContext | null> => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      active: true,
      roles: {
        select: { role: true, scopeType: true, scopeId: true, validFrom: true, validTo: true },
      },
    },
  });
  if (!user) return null;
  return { actor: { id: user.id, active: user.active }, assignments: user.roles };
});
