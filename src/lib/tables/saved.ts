import "server-only";
import { db } from "@/lib/db";
import { MAX_SAVED_FILTERS } from "./types";

export type SavedFilterView = { id: string; name: string; query: string };

/** AC-6: only the caller's own filters are ever read. */
export async function listSavedFilters(
  userId: string,
  tableId: string,
): Promise<SavedFilterView[]> {
  return db.savedFilter.findMany({
    where: { userId, tableId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, query: true },
  });
}

export { MAX_SAVED_FILTERS };
