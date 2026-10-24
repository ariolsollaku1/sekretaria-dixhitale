import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OwnCourseSummary } from "../server/report.queries";

/** AC-6 (Q-93): the student's own attendance per course and kind. */
export async function OwnSummary({
  courses,
  threshold,
}: {
  courses: OwnCourseSummary[];
  threshold: number;
}) {
  const t = await getTranslations("att");
  if (courses.length === 0) return null;
  return (
    <section aria-labelledby="att-own-summary" className="mb-8">
      <h2 id="att-own-summary" className="mb-1 text-base font-semibold">
        {t("own.title")}
      </h2>
      <p className="text-muted-foreground mb-3 text-sm">{t("own.hint", { threshold })}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {courses.map((c) => (
          <li
            key={c.assignmentId}
            className="rounded-card border-border bg-card flex flex-col gap-1 border p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <p>
                <span className="font-semibold">{c.courseCode}</span> {c.courseName} ·{" "}
                {t(`kind.${c.kind}`)}
              </p>
              <p className="font-tabular text-lg font-semibold">
                {c.percent === null ? "—" : `${c.percent}%`}
              </p>
            </div>
            <p className="text-muted-foreground font-tabular">
              {t("own.figures", {
                held: c.heldHours,
                absent: c.absentHours,
                excused: c.excusedHours,
              })}
            </p>
            {c.below && <StatusBadge tone="danger" label={t("own.below", { threshold })} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
