import { Mail, MapPin, Phone, UserRound } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime, formatPlainDate } from "@/lib/i18n/format";
import {
  AddEnrollment,
  ChangeGroup,
  RegisterYear,
  StatusChange,
  listCohortOptions,
  listGroupOptions,
  type EnrollmentRecord,
  type StudentView,
} from "@/modules/stu";

const TONE: Record<string, StatusTone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  DEREGISTERED: "neutral",
  GRADUATED: "info",
};
const toDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The personal data as cards (design-system.md, "Record page"); the fields the viewer may not see
 * (AC-10) are simply absent. `aside` is the account panel, shown under the contact card.
 */
export async function PersonalSection({
  student,
  aside,
}: {
  student: StudentView;
  aside?: ReactNode;
}) {
  const [t, locale] = await Promise.all([getTranslations("stu"), getLocale()]);
  const day = (d: string) => formatPlainDate(d, locale as Locale);
  const mono = (v: string | null) => v && <span className="font-tabular">{v}</span>;
  const contact = [
    { label: t("form.email"), value: student.email, icon: Mail },
    { label: t("form.phone"), value: student.phone, icon: Phone },
    { label: t("form.residence"), value: student.residence, icon: MapPin },
    { label: t("form.address"), value: student.address, icon: MapPin },
  ];
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card aria-labelledby="stu-person">
        <CardTitle id="stu-person" icon={UserRound}>
          {t("tabs.personal")}
        </CardTitle>
        <InfoList
          items={[
            { label: t("form.fatherName"), value: student.fatherName },
            { label: t("form.gender"), value: t(`gender.${student.gender}`) },
            {
              label: t("form.birthDate"),
              value: student.birthDate ? day(student.birthDate) : null,
            },
            { label: t("form.birthPlace"), value: student.birthPlace },
            { label: t("form.nationalId"), value: mono(student.nationalId) },
            { label: t("form.nim"), value: mono(student.nim) },
          ]}
        />
      </Card>
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="stu-contact">
          <CardTitle id="stu-contact" icon={Mail}>
            {t("form.contact")}
          </CardTitle>
          <InfoList className="sm:grid-cols-1" items={contact} />
          {contact.every((c) => !c.value) && (
            <p className="text-muted-foreground text-sm">{t("form.noContact")}</p>
          )}
        </Card>
        {aside}
      </div>
    </div>
  );
}

export async function EnrollmentsSection({
  studentId,
  enrollments,
  canWrite,
}: {
  studentId: string;
  enrollments: EnrollmentRecord[];
  canWrite: boolean;
}) {
  const [t, locale] = await Promise.all([getTranslations("stu"), getLocale()]);
  const day = (d: Date) => formatPlainDate(toDay(d), locale as Locale);
  const cohorts = canWrite ? await listCohortOptions() : [];
  return (
    <div className="flex flex-col gap-6">
      {enrollments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("enrollments.empty")}</p>
      ) : (
        <div className="rounded-card border-border bg-card overflow-x-auto border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.program")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.cohort")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("form.registrationType")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("columns.status")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("form.startedAt")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("enrollments.endedAt")}
                </th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id} className="border-border border-b last:border-0">
                  <th scope="row" className="p-3 text-left font-semibold">
                    {e.program.code} — {e.program.name}
                  </th>
                  <td className="p-3">{e.cohort.name}</td>
                  <td className="p-3">{t(`registrationType.${e.registrationType}`)}</td>
                  <td className="p-3">
                    <StatusBadge
                      tone={TONE[e.status] ?? "neutral"}
                      label={t(`status.${e.status}`)}
                    />
                  </td>
                  <td className="font-tabular p-3">{day(e.startedAt)}</td>
                  <td className="font-tabular p-3">{e.endedAt ? day(e.endedAt) : "—"}</td>
                  {canWrite && (
                    <td className="p-3">
                      <StatusChange
                        enrollmentId={e.id}
                        status={e.status}
                        cohorts={cohorts.filter((c) => c.id !== e.cohort.id)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && (
        <section aria-labelledby="enroll-title">
          <h3 id="enroll-title" className="mb-2 text-lg font-semibold">
            {t("enrollments.add")}
          </h3>
          <AddEnrollment studentId={studentId} cohorts={cohorts} />
        </section>
      )}
    </div>
  );
}

export async function YearsSection({
  enrollments,
  canWrite,
  years,
}: {
  enrollments: EnrollmentRecord[];
  canWrite: boolean;
  years: { id: string; label: string }[];
}) {
  const t = await getTranslations("stu");
  if (enrollments.length === 0)
    return <p className="text-muted-foreground text-sm">{t("enrollments.empty")}</p>;
  return (
    <div className="flex flex-col gap-8">
      {await Promise.all(
        enrollments.map(async (e) => {
          const groups = canWrite || e.years.length > 0 ? await listGroupOptions(e.cohort.id) : [];
          return (
            <section key={e.id} aria-labelledby={`yr-${e.id}`}>
              <h3 id={`yr-${e.id}`} className="mb-2 text-lg font-semibold">
                {e.program.code} · {e.cohort.name}
              </h3>
              {e.years.length === 0 ? (
                <p className="text-muted-foreground mb-3 text-sm">{t("years.empty")}</p>
              ) : (
                <ul className="mb-3 flex flex-col gap-2">
                  {e.years.map((y) => (
                    <li
                      key={y.id}
                      className="rounded-control border-border bg-card flex flex-wrap items-end gap-4 border p-3 text-sm"
                    >
                      <span className="font-semibold">{y.academicYear.code}</span>
                      <span>{t("years.yearOfStudy", { year: y.yearOfStudy })}</span>
                      <span>{t("years.group", { group: y.group.name })}</span>
                      {canWrite && (
                        <ChangeGroup
                          yearRegistrationId={y.id}
                          groupId={y.group.id}
                          label={t("years.changeGroup")}
                          options={groups.filter(
                            (g) =>
                              g.academicYearId === y.academicYear.id &&
                              g.yearOfStudy === y.yearOfStudy,
                          )}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && e.status === "ACTIVE" && (
                <RegisterYear
                  enrollmentId={e.id}
                  durationYears={e.program.durationYears}
                  years={years}
                  groups={groups}
                />
              )}
            </section>
          );
        }),
      )}
    </div>
  );
}

export async function HistorySection({ enrollments }: { enrollments: EnrollmentRecord[] }) {
  const [t, locale] = await Promise.all([getTranslations("stu"), getLocale()]);
  const l = locale as Locale;
  if (enrollments.length === 0)
    return <p className="text-muted-foreground text-sm">{t("enrollments.empty")}</p>;
  return (
    <div className="flex flex-col gap-6">
      {enrollments.map((e) => (
        <section key={e.id} aria-labelledby={`h-${e.id}`}>
          <h3 id={`h-${e.id}`} className="mb-2 text-lg font-semibold">
            {e.program.code} · {e.cohort.name}
          </h3>
          <ol className="flex flex-col gap-2 text-sm">
            {e.history.map((h) => (
              <li key={h.id} className="rounded-control border-border bg-card border p-3">
                <span className="font-semibold">
                  {h.fromStatus ? `${t(`status.${h.fromStatus}`)} → ` : ""}
                  {t(`status.${h.toStatus}`)}
                </span>{" "}
                <span className="font-tabular text-muted-foreground">
                  · {formatPlainDate(toDay(h.effectiveDate), l)} · {formatDateTime(h.createdAt, l)}
                </span>
                {h.reason && <p className="mt-1">{h.reason}</p>}
                {h.documentRef && (
                  <p className="text-muted-foreground mt-1">
                    {t("history.document")}: {h.documentRef}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
