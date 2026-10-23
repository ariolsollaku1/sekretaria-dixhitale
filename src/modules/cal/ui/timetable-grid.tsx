import { getTranslations } from "next-intl/server";
import { formatTime, weekGrid, WEEKDAYS } from "../domain/timetable-rules";
import type { EntryView } from "../server/timetable.queries";

/** AC-5: the week, Monday to Sunday, entries in time order (empty days are left out unless `all`). */
export async function TimetableGrid({
  entries,
  onDay,
  showGroup,
  showLecturer = true,
}: {
  entries: EntryView[];
  onDay?: string;
  showGroup?: boolean;
  showLecturer?: boolean;
}) {
  const t = await getTranslations("cal.timetable");
  const grid = weekGrid(entries, onDay);
  const days = WEEKDAYS.filter((d) => (grid.get(d) ?? []).length > 0);
  if (days.length === 0) return <p className="text-muted-foreground text-sm">{t("empty")}</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {days.map((d) => (
        <section
          key={d}
          aria-labelledby={`wd-${d}`}
          className="rounded-card border-border bg-card border p-4"
        >
          <h3 id={`wd-${d}`} className="mb-2 text-lg font-semibold">
            {t(`weekday.${d}`)}
          </h3>
          <ul className="flex flex-col gap-3 text-sm">
            {grid.get(d)!.map((e) => (
              <li key={e.id}>
                <p className="font-tabular font-semibold">
                  {formatTime(e.startMinute)}–{formatTime(e.endMinute)}
                  {e.room && <span className="text-muted-foreground font-normal"> · {e.room}</span>}
                </p>
                <p>
                  <span className="font-semibold">{e.courseCode}</span> {e.courseName} ·{" "}
                  {t(`kind.${e.kind}`)}
                </p>
                {showLecturer && <p className="text-muted-foreground">{e.lecturer}</p>}
                {showGroup && <p className="text-muted-foreground">{e.groupLabel}</p>}
                {e.note && <p className="text-muted-foreground italic">{e.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
