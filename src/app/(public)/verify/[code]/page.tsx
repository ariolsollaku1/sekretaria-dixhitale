import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { getRequestContext } from "@/lib/audit";
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { getVerification } from "@/lib/documents/queries";
import { typeLabelKey } from "@/lib/documents/types";
import type { Locale } from "@/lib/i18n/config";
import { formatPlainDate } from "@/lib/i18n/format";
import { zonedDay } from "@/lib/i18n/zone";
import { bucketFor, hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// AC-8: no login. Only the type, number, date and status; unknown codes answer 404.
export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  registerDocumentPurposes();
  const [t, tAll, locale, request] = await Promise.all([
    getTranslations("documents.verify"),
    getTranslations(),
    getLocale(),
    getRequestContext(),
  ]);
  const shell = (body: React.ReactNode) => (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 sm:p-8"
    >
      <header>
        <p className="text-muted-foreground text-sm">
          {tAll("shell.appName")} · {tAll("shell.institution")}
        </p>
        <h1 className="mt-2 text-[32px] leading-tight font-semibold">{t("title")}</h1>
      </header>
      {body}
    </main>
  );
  const allowed = await hit(bucketFor("verify", request.ip), { limit: 30, windowMs: 10 * 60_000 });
  if (!allowed.allowed) return shell(<p role="alert">{t("tooMany")}</p>);
  const doc = await getVerification(code);
  if (!doc) notFound();
  const label = (tAll as unknown as (k: string) => string)(typeLabelKey(doc.type));
  return shell(
    <section className="rounded-card border-border bg-card border p-5">
      <p className="mb-4">
        <StatusBadge tone={doc.status === "valid" ? "success" : "danger"} label={t(doc.status)} />
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">{t("type")}</dt>
        <dd className="font-semibold">{label}</dd>
        <dt className="text-muted-foreground">{t("number")}</dt>
        <dd className="font-tabular font-semibold">{doc.number}</dd>
        <dt className="text-muted-foreground">{t("issuedOn")}</dt>
        <dd className="font-tabular font-semibold">
          {formatPlainDate(zonedDay(doc.issuedAt), locale as Locale)}
        </dd>
      </dl>
    </section>,
  );
}
