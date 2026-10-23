"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, DomainError } from "@/lib/actions";
import { getTable } from "./define";
import { MAX_SAVED_FILTERS } from "./types";
import "./all";

const saveSchema = z.object({
  tableId: z.string().min(1).max(100),
  name: z.string().trim().min(1, "required").max(60),
  /** The list's own query string without the page; validated and re-serialised below. */
  query: z.string().max(2000),
  path: z.string().startsWith("/").max(200),
});

const deleteSchema = z.object({ id: z.string().min(1), path: z.string().startsWith("/").max(200) });

/** AC-6: save the current filters under a name (max 20 per table, unique name). */
export const saveFilterAction = action({
  permission: "plt.view.save",
  input: saveSchema,
  handler: async (input, ctx) => {
    const table = getTable(input.tableId);
    if (!table) throw new DomainError("NOT_FOUND", "Unknown table");
    // The user may only save views of tables they may read.
    const { can } = await import("@/lib/authz/guard");
    if (!(await can(ctx.user, table.permission)))
      throw new DomainError("NOT_FOUND", "Unknown table");

    const { parseTableParams, searchParamsToObject, toQueryString } = await import("./params");
    const params = parseTableParams(searchParamsToObject(new URLSearchParams(input.query)), table);
    const query = toQueryString(params, table); // canonical: only validated values, no page

    if (
      (await ctx.db.savedFilter.count({ where: { userId: ctx.user.id, tableId: table.id } })) >=
      MAX_SAVED_FILTERS
    ) {
      throw new DomainError("CONFLICT", "LIMIT_REACHED");
    }
    if (
      await ctx.db.savedFilter.findUnique({
        where: {
          userId_tableId_name: { userId: ctx.user.id, tableId: table.id, name: input.name },
        },
      })
    ) {
      throw new DomainError("VALIDATION", "Name already used", { name: ["nameTaken"] });
    }
    const saved = await ctx.db.savedFilter.create({
      data: { userId: ctx.user.id, tableId: table.id, name: input.name, query },
    });
    revalidatePath(input.path);
    return { id: saved.id };
  },
});

/** AC-6: delete one of the caller's own saved filters (someone else's id behaves like unknown). */
export const deleteFilterAction = action({
  permission: "plt.view.save",
  input: deleteSchema,
  handler: async (input, ctx) => {
    const result = await ctx.db.savedFilter.deleteMany({
      where: { id: input.id, userId: ctx.user.id },
    });
    if (result.count === 0) throw new DomainError("NOT_FOUND", "Saved filter not found");
    revalidatePath(input.path);
  },
});
