import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { formatDateTime, formatPlainDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import {
  ClipboardList,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  UserPlus,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  EnrollForm,
  getApplicationDetail,
  getEnrollDraft,
  isEnrollable,
  placementOptions,
} from "@/modules/adm";

const TONE: Record<string, StatusTone> = {
  SUBMITTED: "info",
  IN_REVIEW: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  ENROLLED: "success",
};
const mono = (v: string | number | null) => v && <span className="font-tabular">{v}</span>;

// ADM-02 AC-11: the detail of one application; ADM-04 AC-9 adds the enrollment (final approval).
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/adm/applications/${id}`);
  if (!(await can(user, "adm.application.read"))) return <ForbiddenView />;
  const [t, ts, locale, a] = await Promise.all([
    getTranslations("adm.applications"),
    getTranslations("adm.status"),
    getLocale(),
    getApplicationDetail(id),
  ]);
  if (!a) notFound();
  const mayEnroll = await can(user, "adm.application.enroll");
  const draft = mayEnroll ? await getEnrollDraft(id) : null;
  const options =
    draft && isEnrollable(draft.status) ? await placementOptions(draft.programId) : null;
  const mayReadStudents = await can(user, "stu.student.read");
  const te = await getTranslations("adm.enroll");
  const person = a.person;
  return (
    <>
      <RecordHero
        name={`${person.firstName} ${person.lastName}`}
        subtitle={`${a.reference} · ${a.program.code}`}
        breadcrumbs={[{ label: t("title"), href: "/adm/applications" }, { label: a.reference }]}
        badges={<StatusBadge tone={TONE[a.status] ?? "info"} label={ts(a.status as never)} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="app-personal">
            <CardTitle id="app-personal" icon={UserRound}>
              {t("personal")}
            </CardTitle>
            <InfoList
              items={[
                { label: t("firstName"), value: person.firstName },
                { label: t("lastName"), value: person.lastName },
                { label: t("fatherName"), value: person.fatherName },
                { label: t("gender"), value: t(person.gender === "FEMALE" ? "female" : "male") },
                {
                  label: t("birthDate"),
                  value: formatPlainDate(person.birthDate, locale as Locale),
                },
                { label: t("birthPlace"), value: person.birthPlace },
                { label: t("nationalId"), value: mono(person.nationalId) },
              ]}
            />
          </Card>

          <Card aria-labelledby="app-education">
            <CardTitle id="app-education" icon={GraduationCap}>
              {t("education")}
            </CardTitle>
            <InfoList
              items={[
                { label: t("schoolName"), value: a.education.schoolName },
                { label: t("schoolCity"), value: a.education.schoolCity },
                { label: t("graduationYear"), value: a.education.graduationYear },
                { label: t("averageGrade"), value: mono(a.education.averageGrade) },
              ]}
            />
          </Card>

          <Card aria-labelledby="app-documents">
            <CardTitle id="app-documents" icon={FileText}>
              {t("documents")}
            </CardTitle>
            <ul className="divide-border flex flex-col divide-y text-sm">
              {a.documents.map((d) => (
                <li
                  key={d.key}
                  data-testid={`doc-${d.key}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <span className="font-semibold">
                    {locale === "en" && d.labelEn ? d.labelEn : d.labelSq}
                  </span>
                  {d.file ? (
                    <span className="flex flex-wrap items-center gap-3">
                      <StatusBadge tone="success" label={t("received")} />
                      <a href={`/api/files/${d.file.id}`} className="underline">
                        {t("download")}: {d.file.name}
                      </a>
                    </span>
                  ) : (
                    <StatusBadge
                      tone={d.required ? "warning" : "neutral"}
                      label={d.required ? t("missing") : t("none")}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card aria-labelledby="app-application">
            <CardTitle id="app-application" icon={ClipboardList}>
              {t("application")}
            </CardTitle>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: t("cycle"), value: `${a.cycle} · ${a.academicYear}` },
                {
                  label: t("program"),
                  value: `${a.program.code} · ${locale === "en" && a.program.nameEn ? a.program.nameEn : a.program.name}`,
                },
                {
                  label: t("submittedAt"),
                  value: formatDateTime(a.submittedAt, locale as Locale),
                },
              ]}
            />
            <p className="text-muted-foreground mt-4 text-[13px]">{t("readOnly")}</p>
          </Card>

          <Card aria-labelledby="app-contact">
            <CardTitle id="app-contact" icon={Mail}>
              {t("contact")}
            </CardTitle>
            <InfoList
              className="sm:grid-cols-1"
              items={[
                { label: t("email"), value: person.email, icon: Mail },
                { label: t("phone"), value: person.phone, icon: Phone },
                { label: t("address"), value: person.address, icon: MapPin },
                { label: t("residence"), value: person.residence, icon: MapPin },
              ]}
            />
          </Card>

          {draft && options && (
            <Card aria-labelledby="app-enroll">
              <CardTitle id="app-enroll" icon={UserPlus}>
                {te("title")}
              </CardTitle>
              <EnrollForm
                applicationId={id}
                person={draft.person}
                options={options}
                missing={draft.missing}
              />
            </Card>
          )}
          {a.status === "ENROLLED" && draft?.result && (
            <Card data-testid="enrolled-note" aria-labelledby="app-enrolled">
              <CardTitle id="app-enrolled" icon={UserPlus}>
                {te("enrolledTitle")}
              </CardTitle>
              <p className="text-sm">
                {te("enrolledOn", {
                  date: formatDateTime(draft.result.enrolledAt, locale as Locale),
                })}
                {mayReadStudents && (
                  <>
                    {" "}
                    <Link href={`/stu/students/${draft.result.studentId}`} className="underline">
                      {te("openStudent")}
                    </Link>
                  </>
                )}
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
