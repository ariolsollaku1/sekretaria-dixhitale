import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { formatDateTime, formatPlainDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import Link from "next/link";
import {
  EnrollForm,
  getApplicationDetail,
  getEnrollDraft,
  isEnrollable,
  placementOptions,
} from "@/modules/adm";

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
  const row = (label: string, value: string | number | null) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </>
  );
  return (
    <>
      <PageHeader
        title={t("detailTitle", { reference: a.reference })}
        breadcrumbs={[{ label: t("title"), href: "/adm/applications" }, { label: a.reference }]}
        actions={<StatusBadge tone="info" label={ts(a.status as never)} />}
      />
      <div className="flex max-w-3xl flex-col gap-4">
        <section className="rounded-card border-border bg-card border p-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
            {row(t("cycle"), `${a.cycle} · ${a.academicYear}`)}
            {row(
              t("program"),
              `${a.program.code} · ${locale === "en" && a.program.nameEn ? a.program.nameEn : a.program.name}`,
            )}
            {row(t("submittedAt"), formatDateTime(a.submittedAt, locale as Locale))}
          </dl>
          <p className="text-muted-foreground mt-3 text-[13px]">{t("readOnly")}</p>
        </section>

        <section className="rounded-card border-border bg-card border p-5">
          <h2 className="mb-3 text-xl font-semibold">{t("personal")}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
            {row(t("firstName"), a.person.firstName)}
            {row(t("lastName"), a.person.lastName)}
            {row(t("fatherName"), a.person.fatherName)}
            {row(t("gender"), t(a.person.gender === "FEMALE" ? "female" : "male"))}
            {row(t("birthDate"), formatPlainDate(a.person.birthDate, locale as Locale))}
            {row(t("birthPlace"), a.person.birthPlace)}
            {row(t("nationalId"), a.person.nationalId)}
            {row(t("email"), a.person.email)}
            {row(t("phone"), a.person.phone)}
            {row(t("address"), a.person.address)}
            {row(t("residence"), a.person.residence)}
          </dl>
        </section>

        <section className="rounded-card border-border bg-card border p-5">
          <h2 className="mb-3 text-xl font-semibold">{t("education")}</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
            {row(t("schoolName"), a.education.schoolName)}
            {row(t("schoolCity"), a.education.schoolCity)}
            {row(t("graduationYear"), a.education.graduationYear)}
            {row(t("averageGrade"), a.education.averageGrade)}
          </dl>
        </section>

        <section className="rounded-card border-border bg-card border p-5">
          <h2 className="mb-3 text-xl font-semibold">{t("documents")}</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {a.documents.map((d) => (
              <li
                key={d.key}
                data-testid={`doc-${d.key}`}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>{locale === "en" && d.labelEn ? d.labelEn : d.labelSq}</span>
                {d.file ? (
                  <span className="flex items-center gap-3">
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
        </section>

        {draft && options && (
          <section className="rounded-card border-border bg-card border p-5">
            <h2 className="mb-3 text-xl font-semibold">{te("title")}</h2>
            <EnrollForm
              applicationId={id}
              person={draft.person}
              options={options}
              missing={draft.missing}
            />
          </section>
        )}
        {a.status === "ENROLLED" && draft?.result && (
          <section
            data-testid="enrolled-note"
            className="rounded-card border-border bg-card border p-5"
          >
            <h2 className="mb-2 text-xl font-semibold">{te("enrolledTitle")}</h2>
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
          </section>
        )}
      </div>
    </>
  );
}
