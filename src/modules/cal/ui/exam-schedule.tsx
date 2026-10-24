import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import { formatTime } from "../domain/timetable-rules";
import type { SittingView } from "../server/exam.queries";

/** AC-8: the exams in date and time order. `showSession` adds the session kind (for "my exams"). */
export async function ExamSchedule({
  sittings,
  showSession,
}: {
  sittings: SittingView[];
  showSession?: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations("cal.exams"), getLocale()]);
  if (sittings.length === 0)
    return <p className="text-muted-foreground text-sm">{t("emptySchedule")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("scheduleCaption")}</caption>
        <thead>
          <tr className="border-border border-b text-left">
            <th scope="col" className="py-2 pr-3 font-semibold">
              {t("form.date")}
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              {t("form.time")}
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              {t("form.course")}
            </th>
            {showSession && (
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t("form.type")}
              </th>
            )}
            <th scope="col" className="py-2 pr-3 font-semibold">
              {t("form.room")}
            </th>
            <th scope="col" className="py-2 font-semibold">
              {t("form.examiners")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sittings.map((s) => (
            <tr key={s.id} className="border-border border-b align-top">
              <td className="font-tabular py-2 pr-3">
                {formatPlainDate(s.date, locale as Locale)}
              </td>
              <td className="font-tabular py-2 pr-3">
                {formatTime(s.startMinute)}–{formatTime(s.endMinute)}
              </td>
              <td className="py-2 pr-3">
                <span className="font-semibold">{s.courseCode}</span> {s.courseName}
                <span className="text-muted-foreground block">
                  {s.programCode} · {t("yearOfStudy", { year: s.yearOfStudy })}
                </span>
              </td>
              {showSession && <td className="py-2 pr-3">{t(`type.${s.sessionType}`)}</td>}
              <td className="py-2 pr-3">{s.room ?? "—"}</td>
              <td className="py-2">{s.examiners.map((x) => x.name).join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
