"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toaster";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { issueOwnPackageAction, issuePackageAction } from "../server/package.actions";

export type PreviewView = {
  enrollmentId: string;
  programCode: string;
  programName: string;
  cohort: string;
  status: string;
  planApproved: boolean;
  counts: { courses: number; included: number; missing: number; credits: number };
};
export type StudentView = {
  studentId: string;
  name: string;
  number: string;
  enrollments: PreviewView[];
};
export type IssuedView = {
  id: string;
  number: string;
  fileId: string;
  issuedAt: Date;
  cancelled: boolean;
  language: string;
  student: string;
  program: string;
};

type Mode = "staff" | "self";

/** AC-11: language choice and the issue button of one enrollment. */
function IssueControl({ enrollment, mode }: { enrollment: PreviewView; mode: Mode }) {
  const t = useTranslations("cur.packages");
  const locale = useLocale();
  const router = useRouter();
  const [language, setLanguage] = useState<"sq" | "en">(locale === "en" ? "en" : "sq");
  const [pending, start] = useTransition();
  const issue = () =>
    start(async () => {
      const run = mode === "staff" ? issuePackageAction : issueOwnPackageAction;
      const r = await run({ enrollmentId: enrollment.enrollmentId, language });
      if (r.ok) {
        toast.success(t("issued", { number: r.data.number }));
        router.refresh();
      } else if (r.error.code === "FORBIDDEN") toast.error(t("forbidden"));
      else if (r.error.code === "UNAVAILABLE") toast.error(t("unavailable"));
      else if (r.error.code === "NOT_FOUND") toast.error(t("noTemplate"));
      else {
        const reason = r.error.fieldErrors?.enrollmentId?.[0];
        toast.error(
          reason === "limitReached"
            ? t("limitReached")
            : reason === "planNotApproved"
              ? t("planNotApproved")
              : reason === "planEmpty"
                ? t("planEmpty")
                : t("failed"),
        );
      }
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={t("language")}
        value={language}
        onChange={(e) => setLanguage(e.target.value as "sq" | "en")}
        className="w-auto"
      >
        <option value="sq">{t("languages.sq")}</option>
        <option value="en">{t("languages.en")}</option>
      </Select>
      <Button onClick={issue} disabled={pending || !enrollment.planApproved}>
        {pending ? t("issuing") : t("issue")}
      </Button>
    </div>
  );
}

function EnrollmentCard({ enrollment, mode }: { enrollment: PreviewView; mode: Mode }) {
  const t = useTranslations("cur.packages");
  const c = enrollment.counts;
  return (
    <li className="rounded-card border-border bg-card flex flex-wrap items-center justify-between gap-3 border p-4">
      <div className="min-w-0">
        <p className="font-semibold">
          {enrollment.programCode} — {enrollment.programName}
        </p>
        <p className="text-muted-foreground text-sm">
          {t("cohort", { name: enrollment.cohort })} · {t(`status.${enrollment.status}` as never)}
        </p>
        {enrollment.planApproved ? (
          <p className="mt-1 text-sm">
            {t("preview", { courses: c.courses, credits: c.credits, included: c.included })}
            {c.missing > 0 && (
              <StatusBadge
                tone="warning"
                className="ml-2"
                label={t("missing", { count: c.missing })}
              />
            )}
          </p>
        ) : (
          <p className="text-muted-foreground mt-1 text-sm">{t("planNotApproved")}</p>
        )}
      </div>
      <IssueControl enrollment={enrollment} mode={mode} />
    </li>
  );
}

/** Students with their enrollments (staff search result) or the student's own enrollments. */
export function PackageStudents({ students, mode }: { students: StudentView[]; mode: Mode }) {
  return (
    <div className="flex flex-col gap-6">
      {students.map((s) => (
        <section key={s.studentId} aria-label={s.name}>
          {mode === "staff" && (
            <h2 className="mb-2 text-base font-semibold">
              {s.name} <span className="text-muted-foreground font-normal">· {s.number}</span>
            </h2>
          )}
          <ul className="flex flex-col gap-2">
            {s.enrollments.map((e) => (
              <EnrollmentCard key={e.enrollmentId} enrollment={e} mode={mode} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** AC-11: issued packages with a download link (the files route enforces who may read). */
export function IssuedPackages({
  items,
  showStudent,
}: {
  items: IssuedView[];
  showStudent: boolean;
}) {
  const t = useTranslations("cur.packages");
  const locale = useLocale() as Locale;
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{t("noneIssued")}</p>;
  return (
    <div className="rounded-card border-border bg-card overflow-x-auto border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            {[
              "number",
              ...(showStudent ? ["student"] : []),
              "program",
              "language",
              "issuedAt",
              "",
            ].map((c, i) => (
              <th key={i} scope="col" className="p-3 font-semibold">
                {c ? t(`columns.${c}` as never) : <span className="sr-only">{t("download")}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id} className="border-border border-b last:border-0">
              <td className="p-3 font-mono">
                {d.number}
                {d.cancelled && (
                  <StatusBadge tone="danger" className="ml-2" label={t("cancelled")} />
                )}
              </td>
              {showStudent && <td className="p-3">{d.student}</td>}
              <td className="p-3">{d.program}</td>
              <td className="p-3">{d.language.toUpperCase()}</td>
              <td className="p-3">{formatDateTime(d.issuedAt, locale)}</td>
              <td className="p-3">
                <a className="text-primary underline" href={`/api/files/${d.fileId}`}>
                  {t("download")}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
