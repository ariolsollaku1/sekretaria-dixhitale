import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { SubmissionActions } from "@/components/forms/submission-actions";
import { EntityHistory } from "@/components/audit/entity-history";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import type { Locale } from "@/lib/i18n/config";
import { formatDateTime } from "@/lib/i18n/format";
import { nextStates, stateDef } from "@/lib/forms/answers";
import { localize } from "@/lib/forms/definition";
import "@/lib/forms/all";
import { getFormHandler } from "@/lib/forms/handlers";
import { getSubmission, listAssignees } from "@/lib/forms/queries";

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/forms/inbox/${id}`);
  if (!(await can(user, "plt.form.inbox"))) return <ForbiddenView />;
  const data = await getSubmission(user.id, id);
  if (!data) notFound(); // not one of my forms = does not exist
  const [t, locale] = await Promise.all([getTranslations("forms"), getLocale()]);
  const l = locale as Locale;
  const { submission, form, actors } = data;
  const def = form.definition;
  const answers = submission.answers as Record<string, unknown>;
  const assignees = await listAssignees(form.ownerRoles);
  // a module may offer more actions for its forms (e.g. STU-07: the recognition decision)
  const moreHref = def.handler ? getFormHandler(def.handler)?.detailHref?.(submission.id) : null;
  const title = `${localize(def.title, l)} · ${submission.reference}`;
  const stateLabel = (k: string | null) => (k ? localize(stateDef(def, k)?.label, l) || k : "—");
  const display = (f: (typeof def.fields)[number]) => {
    const v = answers[f.key];
    if (v === undefined || v === null || v === "") return "—";
    if (f.type === "checkbox") return v ? t("yes") : t("no");
    if ((f.type === "select" || f.type === "radio") && f.options)
      return localize(f.options.find((o) => o.value === v)?.label, l) || String(v);
    return String(v);
  };

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: t("inbox.title"), href: "/forms/inbox" },
          { label: submission.reference },
        ]}
      />
      <p className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge
          tone={
            stateDef(def, submission.state)?.kind === "approved"
              ? "success"
              : stateDef(def, submission.state)?.kind === "rejected"
                ? "danger"
                : "info"
          }
          label={stateLabel(submission.state)}
        />
        <span className="text-muted-foreground">
          {formatDateTime(submission.submittedAt, l)} ·{" "}
          {submission.submitter?.name ?? t("anonymous")}
        </span>
        {submission.assignee && (
          <span>{t("inbox.assignedTo", { name: submission.assignee.name })}</span>
        )}
      </p>
      <section aria-labelledby="answers-title" className="mb-8">
        <h2 id="answers-title" className="mb-3 text-2xl font-semibold">
          {t("inbox.answers")}
        </h2>
        <dl className="grid max-w-2xl gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
          {def.fields.map((f) => (
            <div key={f.key} className="contents">
              <dt className="font-semibold">{localize(f.label, l)}</dt>
              <dd className="whitespace-pre-wrap">
                {f.type === "file" && answers[f.key] ? (
                  <a href={`/api/files/${String(answers[f.key])}`} className="underline">
                    {t("inbox.download")}
                  </a>
                ) : (
                  display(f)
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {moreHref && (
        <p className="mb-6 text-sm">
          <Link href={moreHref} className="font-semibold underline">
            {t("inbox.moreActions")}
          </Link>
        </p>
      )}
      <section aria-labelledby="actions-title" className="mb-8">
        <h2 id="actions-title" className="mb-3 text-2xl font-semibold">
          {t("inbox.actions")}
        </h2>
        <SubmissionActions
          submissionId={submission.id}
          next={nextStates(def, submission.state).map((k) => ({ key: k, label: stateLabel(k) }))}
          assignees={assignees}
          assigneeId={submission.assigneeId}
        />
      </section>
      <section aria-labelledby="history-title" className="mb-8">
        <h2 id="history-title" className="mb-3 text-2xl font-semibold">
          {t("inbox.history")}
        </h2>
        <ol className="flex max-w-2xl flex-col gap-2 text-sm">
          {submission.events.map((e) => (
            <li key={e.id} className="rounded-control border-border bg-card border p-3">
              <span className="font-semibold">
                {e.kind === "STATE"
                  ? `${stateLabel(e.fromState)} → ${stateLabel(e.toState)}`
                  : t(`inbox.events.${e.kind}`)}
              </span>{" "}
              <span className="font-tabular text-muted-foreground">
                · {formatDateTime(e.createdAt, l)}
                {e.actorId ? ` · ${actors.get(e.actorId) ?? ""}` : ""}
              </span>
              {e.comment && e.kind !== "ASSIGNED" && (
                <p className="mt-1 whitespace-pre-wrap">{e.comment}</p>
              )}
            </li>
          ))}
        </ol>
      </section>
      <EntityHistory
        entityType="FormSubmission"
        entityId={submission.id}
        permission="plt.form.inbox"
      />
    </>
  );
}
