import "server-only";
import { registerStaffActiveHandler } from "@/modules/hr";
import { registerEnrollmentOpenedHandler, registerStatusChangeHandler } from "@/modules/stu";
import { syncAccountAccess } from "./account.service";
import { getIdentityProvider } from "./provider";

// IAM-02 AC-5..AC-7: access follows enrollments and employment (SRC-037, Q-128). The handlers run in
// the transaction of the change, so an identity-provider outage stops the change instead of leaving
// a graduated student with access.
registerStatusChangeHandler("iam.sync-access", (ctx, event) =>
  syncAccountAccess(ctx, getIdentityProvider(), event.personId),
);
registerEnrollmentOpenedHandler("iam.sync-access", (ctx, event) =>
  syncAccountAccess(ctx, getIdentityProvider(), event.personId),
);
registerStaffActiveHandler("iam.sync-access", (ctx, event) =>
  syncAccountAccess(ctx, getIdentityProvider(), event.personId),
);
