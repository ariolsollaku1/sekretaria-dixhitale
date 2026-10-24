import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import {
  LeadActions,
  LeadForm,
  getLead,
  inviteBlocker,
  listAssigneeOptions,
  listLeadProgramOptions,
} from "@/modules/adm";

const TONE: Record<string, StatusTone> = {
  NEW: "info",
  CONTACTED: "warning",
  APPLIED: "success",
  LOST: "neutral",
};

const dateTime = (d: Date) =>
  new Intl.DateTimeFormat("sq-AL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Tirane",
  }).format(d);

// ADM-01 AC-5..AC-8: one lead with its data, history and (for writers) the actions.
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/adm/leads/${id}`);
  if (!(await can(user, "adm.lead.read"))) return <ForbiddenView />;
  const lead = await getLead(id);
  if (!lead) notFound();
  const [t, ts, tsrc, mayWrite] = await Promise.all([
    getTranslations("adm.lead"),
    getTranslations("adm.leadStatus"),
    getTranslations("adm.source"),
    can(user, "adm.lead.write"),
  ]);
  const [programs, assignees] = mayWrite
    ? await Promise.all([listLeadProgramOptions(), listAssigneeOptions()])
    : [[], []];
  const name = `${lead.firstName} ${lead.lastName}`;
  const rows: [string, string | null][] = [
    [t("email"), lead.email],
    [t("phone"), lead.phone],
    [t("program"), lead.programLabel ?? lead.programNote],
    [
      t("source"),
      lead.sourceNote ? `${tsrc(lead.source)} · ${lead.sourceNote}` : tsrc(lead.source),
    ],
    [
      t("consent"),
      lead.consent && lead.consentAt
        ? t("consentYes", { at: dateTime(lead.consentAt) })
        : t("consentNo"),
    ],
    [t("assignee"), lead.assigneeName],
    [t("invitedAt"), lead.invitedAt ? dateTime(lead.invitedAt) : null],
    [t("submission"), lead.submissionReference],
    [t("createdAt"), dateTime(lead.createdAt)],
  ];
  const kindLabel = (e: (typeof lead.events)[number]) => {
    switch (e.kind) {
      case "STATUS":
        return t("event.STATUS", {
          from: e.fromStatus ? ts(e.fromStatus) : "",
          to: e.toStatus ? ts(e.toStatus) : "",
        });
      case "INVITED":
        return t("event.INVITED");
      case "ASSIGNED":
        return e.body ? t("event.ASSIGNED", { name: e.body }) : t("event.UNASSIGNED");
      case "EDITED":
        return t("event.EDITED");
      case "NOTE":
        return t("event.NOTE");
      default:
        return t("event.CREATED");
    }
  };
  return (
    <>
      <PageHeader
        title={name}
        breadcrumbs={[{ label: t("leads"), href: "/adm/leads" }, { label: name }]}
        actions={<StatusBadge tone={TONE[lead.status] ?? "neutral"} label={ts(lead.status)} />}
      />
      <dl className="mb-6 grid max-w-3xl gap-x-8 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value ?? "—"}</dd>
          </div>
        ))}
        {lead.status === "LOST" && (
          <div className="contents">
            <dt className="text-muted-foreground">{t("lostReason")}</dt>
            <dd>{lead.lostReason ?? "—"}</dd>
          </div>
        )}
        {lead.message && (
          <div className="contents">
            <dt className="text-muted-foreground">{t("message")}</dt>
            <dd className="break-words whitespace-pre-wrap">{lead.message}</dd>
          </div>
        )}
      </dl>

      {mayWrite && (
        <div className="mb-8 flex flex-col gap-8">
          <LeadActions
            leadId={lead.id}
            status={lead.status}
            assigneeId={lead.assigneeId}
            assignees={assignees}
            canInvite={inviteBlocker(lead) === null}
          />
          <section aria-labelledby="lead-edit-h">
            <h2 id="lead-edit-h" className="mb-3 text-lg font-semibold">
              {t("edit")}
            </h2>
            <LeadForm
              leadId={lead.id}
              programs={programs}
              initial={{
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email ?? "",
                phone: lead.phone ?? "",
                programId: lead.programId ?? "",
                programNote: lead.programNote ?? "",
                message: lead.message ?? "",
                source: lead.source,
                sourceNote: lead.sourceNote ?? "",
              }}
            />
          </section>
        </div>
      )}

      <section aria-labelledby="lead-history-h">
        <h2 id="lead-history-h" className="mb-3 text-lg font-semibold">
          {t("history")}
        </h2>
        <ol className="flex max-w-3xl flex-col gap-3 text-sm">
          {lead.events.map((e) => (
            <li key={e.id} className="border-border border-l-2 pl-3">
              <p className="font-semibold">{kindLabel(e)}</p>
              {e.kind === "NOTE" || (e.kind === "STATUS" && e.body) ? (
                <p className="break-words whitespace-pre-wrap">{e.body}</p>
              ) : null}
              <p className="text-muted-foreground text-[13px]">
                {dateTime(e.createdAt)}
                {e.actorName ? ` · ${e.actorName}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
