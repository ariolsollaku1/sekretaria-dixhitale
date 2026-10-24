import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ForbiddenView } from "@/components/forbidden-view";
import { History, Pencil, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { RecordHero } from "@/components/record/record-hero";
import { Card, CardTitle, InfoList } from "@/components/ui/card";
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
  const details: { label: string; value: ReactNode }[] = [
    ...rows.map(([label, value]) => ({ label, value })),
    ...(lead.status === "LOST" ? [{ label: t("lostReason"), value: lead.lostReason }] : []),
  ];
  return (
    <>
      <RecordHero
        name={name}
        subtitle={lead.programLabel ?? lead.programNote ?? undefined}
        breadcrumbs={[{ label: t("leads"), href: "/adm/leads" }, { label: name }]}
        badges={<StatusBadge tone={TONE[lead.status] ?? "neutral"} label={ts(lead.status)} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="lead-details">
            <CardTitle id="lead-details" icon={UserRound}>
              {t("details")}
            </CardTitle>
            <InfoList items={details} />
            {lead.message && (
              <div className="mt-4">
                <p className="text-muted-foreground text-[13px]">{t("message")}</p>
                <p className="font-semibold break-words whitespace-pre-wrap">{lead.message}</p>
              </div>
            )}
          </Card>

          {mayWrite && (
            <Card aria-labelledby="lead-edit-h">
              <CardTitle id="lead-edit-h" icon={Pencil}>
                {t("edit")}
              </CardTitle>
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
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {mayWrite && (
            <Card aria-label={t("actions")}>
              <LeadActions
                leadId={lead.id}
                status={lead.status}
                assigneeId={lead.assigneeId}
                assignees={assignees}
                canInvite={inviteBlocker(lead) === null}
              />
            </Card>
          )}
          <Card aria-labelledby="lead-history-h">
            <CardTitle id="lead-history-h" icon={History}>
              {t("history")}
            </CardTitle>
            <ol className="border-border flex flex-col gap-5 border-l-2 pl-5 text-sm">
              {lead.events.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    className="bg-brand-gradient ring-card absolute top-1.5 -left-[1.6rem] size-3 rounded-full ring-4"
                  />
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
          </Card>
        </div>
      </div>
    </>
  );
}
