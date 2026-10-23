import "server-only";
import { notify } from "@/lib/notify/notify";
import { registerNotificationType } from "@/lib/notify/types";
import { registerStatusChangeHandler, type StatusChangeHandler } from "./status-hooks";

// AC-5: tell the student when the status of an enrollment changes (optional e-mail).
registerNotificationType({ type: "stu.status" });

export const notifyStudent: StatusChangeHandler = async (ctx, event) => {
  const user = await ctx.db.user.findUnique({
    where: { personId: event.personId },
    select: { id: true },
  });
  if (!user) return;
  await notify(
    { db: ctx.db, afterCommit: ctx.afterCommit },
    {
      userId: user.id,
      type: "stu.status",
      params: { status: event.to },
      link: "/stu/me",
      dedupeKey: `stu.status:${event.enrollmentId}:${event.to}:${event.effectiveDate}`,
    },
  );
};

registerStatusChangeHandler("stu.notify-student", notifyStudent);
