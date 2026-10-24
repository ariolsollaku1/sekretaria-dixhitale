import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatPlainDate } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import { DocumentUpload, PublicShell, getApplicationByToken } from "@/modules/adm";

export const dynamic = "force-dynamic";

// AC-7: the private link must not leak through the Referer header or into search results.
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

// ADM-02 AC-7, AC-8: the candidate's private status page. An unknown, malformed or expired token
// answers 404 (the same for all three).
export default async function ApplicationStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const [{ token }, { new: justSent }] = await Promise.all([params, searchParams]);
  const view = await getApplicationByToken(token);
  if (!view) notFound();
  const [t, locale] = await Promise.all([getTranslations("adm.status"), getLocale()]);
  const label = (l: { sq: string; en: string | null }) => (locale === "en" && l.en ? l.en : l.sq);
  return (
    <PublicShell title={t("title")}>
      {justSent && (
        <p
          role="status"
          className="rounded-card border-success/40 bg-success-bg border p-4 text-sm"
        >
          {t("received", { reference: view.reference })}
        </p>
      )}
      <section className="rounded-card border-border bg-card border p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">{t("reference")}</dt>
          <dd className="font-tabular font-semibold">{view.reference}</dd>
          <dt className="text-muted-foreground">{t("statusLabel")}</dt>
          <dd>
            <StatusBadge
              tone={
                view.status === "REJECTED"
                  ? "danger"
                  : view.status === "ACCEPTED" || view.status === "ENROLLED"
                    ? "success"
                    : "info"
              }
              label={t(view.status as never)}
            />
          </dd>
          <dt className="text-muted-foreground">{t("program")}</dt>
          <dd>
            {view.program.code} ·{" "}
            {locale === "en" && view.program.nameEn ? view.program.nameEn : view.program.name}
          </dd>
          <dt className="text-muted-foreground">{t("cycle")}</dt>
          <dd>{view.cycle}</dd>
        </dl>
      </section>

      <section className="rounded-card border-border bg-card border p-5">
        <h2 className="mb-3 text-xl font-semibold">{t("summary")}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">{t("name")}</dt>
          <dd>
            {view.data.firstName} {view.data.lastName}
          </dd>
          <dt className="text-muted-foreground">{t("birthDate")}</dt>
          <dd>{formatPlainDate(view.data.birthDate, locale as Locale)}</dd>
          <dt className="text-muted-foreground">{t("email")}</dt>
          <dd>{view.data.email}</dd>
          <dt className="text-muted-foreground">{t("phone")}</dt>
          <dd>{view.data.phone}</dd>
          <dt className="text-muted-foreground">{t("school")}</dt>
          <dd>
            {view.data.schoolName} ({view.data.graduationYear})
          </dd>
          <dt className="text-muted-foreground">{t("average")}</dt>
          <dd className="font-tabular">{view.data.averageGrade}</dd>
        </dl>
      </section>

      <section className="rounded-card border-border bg-card border p-5">
        <h2 className="mb-1 text-xl font-semibold">{t("documents")}</h2>
        {view.documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noDocuments")}</p>
        ) : (
          <>
            <p className="text-muted-foreground mb-3 text-sm">{t("documentsHint")}</p>
            <p role="status" className="mb-3 text-sm font-semibold">
              {view.missing.length === 0
                ? t("allReceived")
                : t("missingCount", { count: view.missing.length })}
            </p>
            <ul className="flex flex-col gap-4">
              {view.documents.map((d) => (
                <li
                  key={d.key}
                  data-testid={`doc-${d.key}`}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {label(d.label)}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({d.required ? t("required") : t("optional")})
                      </span>
                    </p>
                    <p className="text-muted-foreground text-[13px]">
                      {d.file ? t("received_doc", { name: d.file.name }) : t("missing")}
                    </p>
                  </div>
                  {view.canUpload && (
                    <DocumentUpload token={token} documentKey={d.key} hasFile={!!d.file} />
                  )}
                </li>
              ))}
            </ul>
            {!view.canUpload && (
              <p className="text-muted-foreground mt-3 text-sm">{t("closedNote")}</p>
            )}
          </>
        )}
      </section>
      <p className="text-sm">
        <Link href="/apply/link" className="underline">
          {t("newLink")}
        </Link>
      </p>
    </PublicShell>
  );
}
