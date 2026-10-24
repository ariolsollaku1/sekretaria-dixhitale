"use server";

import { z } from "zod";
import "../permissions";
import { action } from "@/lib/actions";
import * as packages from "./package.service";

const input = z.object({ enrollmentId: z.string().min(1), language: z.enum(["sq", "en"]) });

// Two actions, one per permission; the service re-checks program scope (staff) or ownership (self).
export const issuePackageAction = action({
  permission: "cur.package.issue",
  input,
  handler: (data, ctx) => packages.issuePackage(ctx, "staff", data),
});
export const issueOwnPackageAction = action({
  permission: "cur.package.self",
  input,
  handler: (data, ctx) => packages.issuePackage(ctx, "self", data),
});
